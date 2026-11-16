import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/app/db';
import { withTenant } from '@/lib/db/tenantContext';
import { users, workspaceLicenses, workspaces } from '@/app/db/schema';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { withBasePath } from '@/lib/basePath';
import {
  getRequiredBaseUrl,
  resolveWorkspaceCheckoutPrice,
  stripe,
} from '@/lib/stripe';
import { userCanManageWorkspaceBilling } from '@/lib/workspace/entitlement';
import { licensePlanForWorkspaceType } from '@/app/db/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
});

function workspaceBillingEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_WORKSPACE_BILLING_ENABLED === 'true') return true;
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
}

/**
 * Stripe Checkout (subscription) for Creator / Business workspaces.
 * Callable by workspace owner/admin only (not platform admin Subscribe).
 */
export async function POST(req: NextRequest) {
  if (!workspaceBillingEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await enforceRateLimit({
    key: `stripe-ws-checkout:${userId}`,
    limit: 10,
    windowMs: 60_000,
    prefix: 'rl',
    message: 'Too many checkout attempts. Please wait a moment.',
  });
  if (limited) return limited;

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const canBill = await userCanManageWorkspaceBilling(
    user.id,
    parsed.data.workspaceId,
  );
  if (!canBill) {
    return NextResponse.json(
      { error: 'Only the workspace owner can start billing' },
      { status: 403 },
    );
  }

  // FORCE RLS: a plain db read found no workspace, so checkout always
  // failed with "Workspace not found". Read under the workspace's tenant.
  const workspaceId = parsed.data.workspaceId;
  const workspace = await withTenant(workspaceId, user.id, (tx) =>
    tx.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) }),
  );
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }
  if (workspace.type !== 'creator' && workspace.type !== 'business') {
    return NextResponse.json(
      {
        error:
          'Only creator and business workspaces use self-serve Stripe. Department and institution plans are invoiced.',
      },
      { status: 400 },
    );
  }

  let baseUrl: string;
  try {
    baseUrl = getRequiredBaseUrl();
  } catch (configError) {
    console.error('Workspace checkout misconfiguration:', configError);
    return NextResponse.json({ error: 'Checkout is not configured.' }, { status: 500 });
  }

  try {
    const price = await resolveWorkspaceCheckoutPrice(workspace.type);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: userId,
      customer_email: user.email || undefined,
      metadata: {
        clerkUserId: userId,
        workspaceId: workspace.id,
        workspaceType: workspace.type,
        kind: 'workspace_license',
      },
      subscription_data: {
        metadata: {
          workspaceId: workspace.id,
          workspaceType: workspace.type,
          kind: 'workspace_license',
        },
      },
      success_url: `${baseUrl}${withBasePath('/dashboard/workspace')}?billing=success`,
      cancel_url: `${baseUrl}${withBasePath('/dashboard/workspace')}?billing=cancel`,
    });

    await withTenant(workspace.id, user.id, (tx) =>
      tx
        .update(workspaceLicenses)
        .set({
          status: 'trialing',
          billingProvider: 'stripe',
          plan: licensePlanForWorkspaceType(workspace.type),
          updatedAt: new Date(),
        })
        .where(eq(workspaceLicenses.workspaceId, workspace.id)),
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Workspace Stripe checkout error:', error);
    return NextResponse.json({ error: 'Stripe checkout failed' }, { status: 500 });
  }
}
