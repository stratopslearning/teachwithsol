import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { db } from '@/app/db';
import { withTenant } from '@/lib/db/tenantContext';
import {
  stripeEvents,
  users as dbUsers,
  workspaceLicenses,
  workspaces,
} from '@/app/db/schema';
import { logAudit } from '@/lib/audit';
import { invalidateUserCache } from '@/lib/getOrCreateUser';
import { stripe } from '@/lib/stripe';

// Stripe webhooks need the raw request body for signature verification, so
// we MUST run on the Node.js runtime. The Edge runtime would buffer the body
// in a way that breaks the signature check.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    // 5xx so Stripe retries when the deploy gets the env var.
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const rawBody = await req.arrayBuffer();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      Buffer.from(rawBody),
      sig,
      webhookSecret,
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Claim pattern:
  // 1) Insert event with processedAt = null (unique on event_id).
  // 2) On conflict: if processedAt set → ACK (done). If null → re-enter
  //    processing (side effects are idempotent: toggle paid flags).
  // 3) Never delete the row on failure — that raced with concurrent retries
  //    that had already ACKed as "deduped" and dropped the event forever.
  // 4) Only ACK "already done" when processedAt is set.
  try {
    await db.insert(stripeEvents).values({
      eventId: event.id,
      type: event.type,
      payload: event as unknown as object,
    });
  } catch {
    const existing = await db.query.stripeEvents.findFirst({
      where: eq(stripeEvents.eventId, event.id),
    });
    if (existing?.processedAt) {
      return NextResponse.json({ received: true, deduped: true });
    }
    // Row exists but unprocessed (prior attempt failed, or still in flight).
    // Fall through and re-run idempotent side effects, then stamp processedAt.
    console.warn('Stripe event claim retry (unprocessed row):', event.id);
  }

  try {
    await processStripeEvent(event);
    await db
      .update(stripeEvents)
      .set({ processedAt: new Date() })
      .where(eq(stripeEvents.eventId, event.id));
  } catch (err) {
    console.error('Stripe webhook handler failed:', { eventId: event.id, err });
    // Leave the unprocessed row so the next delivery can reclaim it.
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // payment_status guard: a completed session can still be `unpaid` for
      // async-payment flows; we only mark paid on confirmed payment.
      if (session.payment_status !== 'paid' && session.mode !== 'subscription') {
        return;
      }
      // Subscription mode: unpaid is normal until first invoice; treat as paid
      // when status is paid OR subscription is present.
      if (
        session.mode === 'subscription' &&
        session.payment_status !== 'paid' &&
        !session.subscription
      ) {
        return;
      }

      const clerkUserId =
        session.metadata?.clerkUserId ?? session.client_reference_id ?? null;
      if (!clerkUserId) {
        throw new Error(
          `checkout.session.completed missing clerkUserId metadata (session ${session.id})`,
        );
      }

      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id ?? null;

      const workspaceId = session.metadata?.workspaceId ?? null;
      if (
        session.metadata?.kind === 'workspace_license' &&
        workspaceId
      ) {
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id ?? null;
        // FORCE RLS: plain db updates matched no rows, so a paid license
        // was never activated. Write under the workspace's tenant, and fail
        // loudly (Stripe retries) if the license row is missing.
        const activated = await withTenant(workspaceId, null, async (tx) => {
          const licenseRows = await tx
            .update(workspaceLicenses)
            .set({
              status: 'active',
              billingProvider: 'stripe',
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              updatedAt: new Date(),
            })
            .where(eq(workspaceLicenses.workspaceId, workspaceId))
            .returning({ id: workspaceLicenses.id });
          await tx
            .update(workspaces)
            .set({ status: 'active', updatedAt: new Date() })
            .where(eq(workspaces.id, workspaceId));
          return licenseRows.length;
        });
        if (activated === 0) {
          throw new Error(
            `checkout.session.completed: no license row for workspace ${workspaceId} (session ${session.id})`,
          );
        }
        const actor = await db.query.users.findFirst({
          where: eq(dbUsers.clerkId, clerkUserId),
        });
        if (actor) {
          await logAudit({
            actorUserId: actor.id,
            actorClerkId: clerkUserId,
            action: 'billing.workspace.license.activate',
            targetType: 'workspace',
            targetId: workspaceId,
            metadata: {
              source: 'stripe.checkout.session.completed',
              subscriptionId,
            },
          });
        }
        return;
      }

      const result = await db
        .update(dbUsers)
        .set({
          paid: true,
          stripeCustomerId: customerId,
          updatedAt: new Date(),
        })
        .where(eq(dbUsers.clerkId, clerkUserId))
        .returning({ id: dbUsers.id });

      if (result.length === 0) {
        throw new Error(
          `checkout.session.completed referenced unknown clerkUserId ${clerkUserId} (session ${session.id})`,
        );
      }
      invalidateUserCache({ clerkId: clerkUserId, userId: result[0].id });
      await logAudit({
        actorUserId: result[0].id,
        actorClerkId: clerkUserId,
        action: 'education.paid.update',
        targetType: 'user',
        targetId: result[0].id,
        metadata: { paid: true, source: 'stripe.checkout.session.completed' },
      });
      return;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = sub.metadata?.workspaceId;
      if (!workspaceId) return;
      const status =
        event.type === 'customer.subscription.deleted' ||
        sub.status === 'canceled'
          ? 'canceled'
          : sub.status === 'past_due'
            ? 'past_due'
            : sub.status === 'trialing'
              ? 'trialing'
              : 'active';
      // FORCE RLS: write under the workspace's tenant (plain db updates
      // matched no rows, so cancellations never suspended anything).
      await withTenant(workspaceId, null, async (tx) => {
        await tx
          .update(workspaceLicenses)
          .set({
            status,
            stripeSubscriptionId: sub.id,
            stripeCustomerId:
              typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
            updatedAt: new Date(),
          })
          .where(eq(workspaceLicenses.workspaceId, workspaceId));
        if (status === 'canceled') {
          await tx
            .update(workspaces)
            .set({ status: 'suspended', updatedAt: new Date() })
            .where(eq(workspaces.id, workspaceId));
        }
      });
      return;
    }

    case 'charge.refunded':
    case 'charge.dispute.created':
    case 'charge.dispute.funds_withdrawn': {
      const charge =
        event.type === 'charge.refunded'
          ? (event.data.object as Stripe.Charge)
          : await resolveChargeFromDispute(event.data.object as Stripe.Dispute);

      const customerId =
        typeof charge.customer === 'string'
          ? charge.customer
          : charge.customer?.id ?? null;

      // Prefer customer mapping, fall back to PaymentIntent metadata which we
      // populated at checkout creation time.
      let clerkUserId: string | null = null;
      if (charge.payment_intent) {
        const piId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent.id;
        try {
          const pi = await stripe.paymentIntents.retrieve(piId);
          clerkUserId = pi.metadata?.clerkUserId ?? null;
        } catch (e) {
          console.warn('Failed to retrieve payment intent for refund/dispute', e);
        }
      }

      if (!clerkUserId && customerId) {
        const customerRow = await db.query.users.findFirst({
          where: eq(dbUsers.stripeCustomerId, customerId),
        });
        clerkUserId = customerRow?.clerkId ?? null;
      }

      if (!clerkUserId) {
        // Unable to map back to a user: log loudly so finance can investigate.
        console.error(
          `${event.type} could not be mapped to a user`,
          { eventId: event.id, customerId },
        );
        return;
      }

      const cleared = await db
        .update(dbUsers)
        .set({ paid: false, updatedAt: new Date() })
        .where(eq(dbUsers.clerkId, clerkUserId))
        .returning({ id: dbUsers.id });

      if (cleared[0]) {
        invalidateUserCache({ clerkId: clerkUserId, userId: cleared[0].id });
        await logAudit({
          actorUserId: cleared[0].id,
          actorClerkId: clerkUserId,
          action: 'education.paid.update',
          targetType: 'user',
          targetId: cleared[0].id,
          metadata: { paid: false, source: event.type },
        });
      }
      return;
    }

    default:
      // Other event types are accepted (200) but produce no side effects.
      return;
  }
}

async function resolveChargeFromDispute(
  dispute: Stripe.Dispute,
): Promise<Stripe.Charge> {
  const chargeId =
    typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
  return stripe.charges.retrieve(chargeId);
}
