import { NextRequest, NextResponse } from 'next/server';
import { fetchAdminWorkspaceDirectory } from '@/lib/admin/platformReads';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/app/db';
import { users } from '@/app/db/schema';
import { provisionWorkspace } from '@/lib/workspace';
import { createWorkspaceOwnerInvite } from '@/lib/workspace/invites';
import {
  defaultTierForSku,
  getTier,
  tiersForSku,
} from '@/lib/workspace/pricing';
import { appBaseUrl } from '@/lib/siteUrl';
import { LICENSE_PLANS, licensePlanForWorkspaceType, WORKSPACE_TYPES } from '@/app/db/enums';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(120),
  type: z.enum(WORKSPACE_TYPES),
  parentWorkspaceId: z.string().uuid().optional().nullable(),
  seatCap: z.number().int().min(1).max(10_000_000).optional(),
  pricingTierId: z.string().min(1).max(64).optional(),
  ownerEmail: z.string().email(),
  plan: z.enum(LICENSE_PLANS).optional(),
});

async function requireAdminUser() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });
  if (!user || !user.platformStaff) return null;
  return user;
}

export async function GET() {
  try {
    const user = await requireAdminUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Metadata-only directory via the SECURITY DEFINER lookup. Under FORCE
    // RLS the old plain db read returned no workspaces at all.
    const directory = await fetchAdminWorkspaceDirectory();
    return NextResponse.json({
      workspaces: directory,
      pricingCatalog: {
        creator: tiersForSku('creator'),
        business: tiersForSku('business'),
        department: tiersForSku('department'),
        institution: tiersForSku('institution'),
      },
    });
  } catch (error) {
    console.error('[admin/workspaces GET]', error);
    return NextResponse.json({ error: 'Failed to list workspaces' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      return NextResponse.json(
        {
          error: first
            ? `${first.path.join('.') || 'body'}: ${first.message}`
            : 'Validation error',
          details: parsed.error.errors,
        },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const tier =
      (data.pricingTierId ? getTier(data.pricingTierId) : undefined) ??
      defaultTierForSku(data.type);
    if (tier.sku !== data.type) {
      return NextResponse.json(
        { error: `Tier ${tier.id} does not match type ${data.type}` },
        { status: 400 },
      );
    }

    const plan = data.plan ?? licensePlanForWorkspaceType(data.type);

    const { workspace, license } = await provisionWorkspace({
      slug: data.slug,
      name: data.name,
      type: data.type,
      plan,
      seatCap: data.seatCap ?? tier.seatCap,
      pricingTierId: data.pricingTierId,
      parentWorkspaceId: data.parentWorkspaceId ?? null,
      actorUserId: user.id,
      actorClerkId: user.clerkId,
    });

    const baseUrl = appBaseUrl();

    const ownerEmail = data.ownerEmail.trim().toLowerCase();
    const invite = await createWorkspaceOwnerInvite({
      workspaceId: workspace.id,
      email: ownerEmail,
      role: 'owner',
      baseUrl,
    });

    const { sendWorkspaceInviteMail } = await import('@/lib/email');
    const emailResult = await sendWorkspaceInviteMail({
      workspaceId: workspace.id,
      to: ownerEmail,
      workspaceName: workspace.name,
      role: 'owner',
      claimUrl: invite.claimUrl,
      expiresAt: invite.expiresAt,
    });

    return NextResponse.json({
      success: true,
      workspace,
      license,
      pricingTier: tier,
      invite: {
        email: ownerEmail,
        claimUrl: invite.claimUrl,
        expiresAt: invite.expiresAt.toISOString(),
      },
      emailSent: emailResult.ok && !('skipped' in emailResult && emailResult.skipped),
      emailSkipped: Boolean(
        emailResult.ok && 'skipped' in emailResult && emailResult.skipped,
      ),
      emailError: emailResult.ok ? undefined : emailResult.error,
    });
  } catch (error) {
    console.error('[admin/workspaces POST]', error);
    const message =
      error instanceof Error
        ? `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}`
        : String(error);
    if (/unique|duplicate|already exists/i.test(message)) {
      return NextResponse.json(
        {
          error:
            'That slug already exists. Pick a new slug, or use Resend invite on the existing workspace.',
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && /email/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to create workspace' },
      { status: 500 },
    );
  }
}
