import { randomUUID } from 'crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  authoringPolicies,
  roleBindings,
  users,
  workspaceInvites,
  workspaceLicenses,
  workspaceMemberships,
  workspaces,
} from '@/app/db/schema';
import { logAudit } from '@/lib/audit';
import {
  DEFAULT_ONBOARDING_CHECKLIST,
  parseWorkspaceSettings,
} from '@/lib/onboarding/workspaceSettings';
import { withTenant } from '@/lib/db/tenantContext';
import {
  buildClaimUrl,
  hashInviteToken,
  mintInviteToken,
} from '@/lib/workspace/invites';
import {
  defaultTierForSku,
  getTier,
  type WorkspaceSku,
} from '@/lib/workspace/pricing';
import { licensePlanForWorkspaceType, type LicensePlan } from '@/app/db/enums';

export type WorkspacePlan = LicensePlan;

export type ProvisionWorkspaceInput = {
  slug: string;
  name: string;
  type: WorkspaceSku;
  plan?: WorkspacePlan;
  ownerUserId?: string | null;
  seatCap?: number;
  pricingTierId?: string;
  parentWorkspaceId?: string | null;
  actorUserId?: string | null;
  actorClerkId?: string | null;
};

export type ProvisionWorkspaceResult = {
  workspace: typeof workspaces.$inferSelect;
  license: typeof workspaceLicenses.$inferSelect;
  created: boolean;
};

/**
 * Find a workspace by slug under FORCE RLS. Without app.tenant_id, rows are
 * only visible via active membership when app.user_id is set.
 */
async function findWorkspaceBySlugVisibleToUser(
  slug: string,
  userId: string | null | undefined,
): Promise<
  | (typeof workspaces.$inferSelect & {
      licenses: (typeof workspaceLicenses.$inferSelect)[];
    })
  | undefined
> {
  return db.transaction(async (tx) => {
    if (userId) {
      await tx.execute(
        sql`select set_config('app.user_id', ${userId}, true)`,
      );
    }
    // Membership OR lets the workspace row through; licenses only match
    // workspace_id = app.tenant_id, so pin tenant after we know the id.
    const row = await tx.query.workspaces.findFirst({
      where: eq(workspaces.slug, slug),
    });
    if (!row) return undefined;
    await tx.execute(
      sql`select set_config('app.tenant_id', ${row.id}, true)`,
    );
    const licenses = await tx.query.workspaceLicenses.findMany({
      where: eq(workspaceLicenses.workspaceId, row.id),
    });
    return { ...row, licenses };
  });
}

export async function provisionWorkspace(
  input: ProvisionWorkspaceInput,
): Promise<ProvisionWorkspaceResult> {
  const slug = input.slug.trim().toLowerCase();
  const tier =
    (input.pricingTierId ? getTier(input.pricingTierId) : undefined) ??
    defaultTierForSku(input.type);
  if (tier.sku !== input.type) {
    throw new Error(`Tier ${tier.id} does not match type ${input.type}`);
  }

  const plan: WorkspacePlan =
    input.plan ?? licensePlanForWorkspaceType(input.type);

  const stripeBilled = input.type === 'creator' || input.type === 'business';
  const actorId = input.ownerUserId ?? input.actorUserId ?? null;

  const existing = await findWorkspaceBySlugVisibleToUser(
    slug,
    input.ownerUserId ?? input.actorUserId,
  );

  if (existing) {
    const license =
      existing.licenses?.find((l) =>
        ['active', 'trialing'].includes(l.status),
      ) ?? existing.licenses?.[0];
    if (!license) {
      throw new Error(`Workspace ${slug} exists but has no license`);
    }
    if (input.ownerUserId) {
      await withTenant(existing.id, input.ownerUserId, async (tx) => {
        const membership = await tx.query.workspaceMemberships.findFirst({
          where: and(
            eq(workspaceMemberships.workspaceId, existing.id),
            eq(workspaceMemberships.userId, input.ownerUserId!),
          ),
        });
        if (!membership) {
          await tx.insert(workspaceMemberships).values({
            workspaceId: existing.id,
            userId: input.ownerUserId!,
            role: 'member',
            status: 'active',
          });
        } else if (membership.status !== 'active') {
          await tx
            .update(workspaceMemberships)
            .set({ status: 'active', role: 'member', updatedAt: new Date() })
            .where(eq(workspaceMemberships.id, membership.id));
        }

        const binding = await tx.query.roleBindings.findFirst({
          where: and(
            eq(roleBindings.tenantId, existing.id),
            eq(roleBindings.userId, input.ownerUserId!),
            eq(roleBindings.scopeType, 'organization'),
            eq(roleBindings.scopeId, existing.id),
            eq(roleBindings.role, 'owner'),
            isNull(roleBindings.revokedAt),
          ),
        });
        if (!binding) {
          await tx.insert(roleBindings).values({
            tenantId: existing.id,
            userId: input.ownerUserId!,
            scopeType: 'organization',
            scopeId: existing.id,
            role: 'owner',
            grantedBy: input.actorUserId ?? input.ownerUserId!,
          });
        }
      });
    }
    await withTenant(existing.id, actorId, async (tx) => {
      await ensureDefaultAuthoringPolicyTx(tx, existing.id);
      await ensureOnboardingSettingsTx(tx, existing.id, existing.settings);
    });
    return { workspace: existing, license, created: false };
  }

  const initialSettings = {
    onboardingChecklist: { ...DEFAULT_ONBOARDING_CHECKLIST },
    onboardingProvisionedAt: new Date().toISOString(),
  };

  const workspaceId = randomUUID();

  // SECURITY DEFINER bootstrap — avoids chicken/egg RLS on workspaces INSERT
  // (WITH CHECK requires app.tenant_id = new id before the row exists).
  await db.execute(sql`
    SELECT sol_bootstrap_workspace(
      ${workspaceId}::uuid,
      ${slug}::text,
      ${input.name.trim()}::text,
      ${input.type}::text,
      ${stripeBilled ? 'trial' : 'active'}::text,
      ${input.parentWorkspaceId ?? null}::uuid,
      ${JSON.stringify(initialSettings)}::jsonb,
      ${input.ownerUserId ?? null}::uuid,
      ${plan}::text,
      ${(input.seatCap ?? tier.seatCap)}::integer,
      ${tier.aiUnitCap}::integer,
      ${stripeBilled ? 'stripe' : 'manual'}::text,
      -- Creator/Business: incomplete until Stripe checkout or admin Grant pilot.
      -- Do not use trialing+null period_end here — that is the indefinite pilot.
      ${stripeBilled ? 'incomplete' : 'active'}::text
    )
  `);

  // Neon pool/WS often drops transaction-local app.tenant_id GUCs between
  // statements, so FORCE RLS hides the new row after bootstrap. Read via DEFINER.
  const fetched = await db.execute(sql`
    SELECT workspace, license
    FROM sol_fetch_provisioned_workspace(${workspaceId}::uuid)
  `);
  const fetchedRows =
    (fetched as unknown as { rows?: { workspace: unknown; license: unknown }[] })
      .rows ??
    (Array.isArray(fetched)
      ? (fetched as { workspace: unknown; license: unknown }[])
      : []);
  const bundle = fetchedRows[0];
  if (!bundle?.workspace) {
    throw new Error('Workspace bootstrap succeeded but row is not visible');
  }
  if (!bundle.license) {
    throw new Error('Workspace license missing after bootstrap');
  }

  const workspace = mapJsonWorkspace(bundle.workspace);
  const license = mapJsonLicense(bundle.license);

  if (input.ownerUserId) {
    await withTenant(workspaceId, actorId, async (tx) => {
      await ensureDefaultFacultyJoinLinkTx(tx, {
        workspaceId,
        ownerUserId: input.ownerUserId ?? null,
        existingSettings: initialSettings,
      });
    });
  }

  await logAudit({
    actorUserId: input.actorUserId ?? input.ownerUserId ?? null,
    actorClerkId: input.actorClerkId ?? null,
    action: 'workspace.provision',
    targetType: 'workspace',
    targetId: workspace.id,
    tenantId: workspace.id,
    metadata: {
      slug,
      type: input.type,
      plan,
      created: true,
    },
  });

  return { workspace, license, created: true };
}

type Tx = Parameters<Parameters<typeof withTenant>[2]>[0];

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  return new Date();
}

function mapJsonWorkspace(
  raw: unknown,
): typeof workspaces.$inferSelect {
  const w = raw as Record<string, unknown>;
  return {
    id: String(w.id),
    slug: String(w.slug),
    name: String(w.name),
    type: w.type as typeof workspaces.$inferSelect.type,
    status: w.status as typeof workspaces.$inferSelect.status,
    parentWorkspaceId: (w.parent_workspace_id as string | null) ?? null,
    settings: (w.settings as Record<string, unknown>) ?? {},
    createdAt: asDate(w.created_at),
    updatedAt: asDate(w.updated_at),
  };
}

function mapJsonLicense(
  raw: unknown,
): typeof workspaceLicenses.$inferSelect {
  const l = raw as Record<string, unknown>;
  return {
    id: String(l.id),
    workspaceId: String(l.workspace_id),
    plan: l.plan as typeof workspaceLicenses.$inferSelect.plan,
    status: l.status as typeof workspaceLicenses.$inferSelect.status,
    seatCap: Number(l.seat_cap ?? 0),
    aiUnitCap: Number(l.ai_unit_cap ?? 0),
    billingProvider:
      l.billing_provider as typeof workspaceLicenses.$inferSelect.billingProvider,
    stripeCustomerId: (l.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId: (l.stripe_subscription_id as string | null) ?? null,
    periodStart: l.period_start ? asDate(l.period_start) : null,
    periodEnd: l.period_end ? asDate(l.period_end) : null,
    createdAt: asDate(l.created_at),
    updatedAt: asDate(l.updated_at),
  };
}

async function ensureOnboardingSettingsTx(
  tx: Tx,
  workspaceId: string,
  settings: Record<string, unknown> | null | undefined,
): Promise<void> {
  const merged = parseWorkspaceSettings(settings);
  if (merged.onboardingChecklist) return;
  await tx
    .update(workspaces)
    .set({
      settings: {
        ...merged,
        onboardingChecklist: { ...DEFAULT_ONBOARDING_CHECKLIST },
        onboardingProvisionedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));
}

async function ensureDefaultFacultyJoinLinkTx(
  tx: Tx,
  opts: {
    workspaceId: string;
    ownerUserId: string | null;
    existingSettings: Record<string, unknown>;
  },
): Promise<void> {
  if (!opts.ownerUserId) return;
  const owner = await tx.query.users.findFirst({
    where: eq(users.id, opts.ownerUserId),
    columns: { email: true },
  });
  const email = owner?.email?.trim().toLowerCase();
  if (!email) return;

  try {
    const token = mintInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await tx
      .update(workspaceInvites)
      .set({ expiresAt: new Date() })
      .where(
        and(
          eq(workspaceInvites.workspaceId, opts.workspaceId),
          sql`lower(${workspaceInvites.email}) = ${email}`,
          isNull(workspaceInvites.claimedAt),
        ),
      );
    await tx.insert(workspaceInvites).values({
      workspaceId: opts.workspaceId,
      email,
      role: 'instructor',
      tokenHash,
      expiresAt,
    });
    const claimUrl = buildClaimUrl(token);
    await tx
      .update(workspaces)
      .set({
        settings: {
          ...opts.existingSettings,
          defaultFacultyInviteClaimUrl: claimUrl,
        },
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, opts.workspaceId));
  } catch {
    // Non-fatal — owner can mint invites from Workspace → Team.
  }
}

async function ensureDefaultAuthoringPolicyTx(
  tx: Tx,
  workspaceId: string,
): Promise<void> {
  const existing = await tx.query.authoringPolicies.findFirst({
    where: eq(authoringPolicies.workspaceId, workspaceId),
    columns: { id: true },
  });
  if (existing) return;

  await tx.insert(authoringPolicies).values({
    workspaceId,
    tenantId: workspaceId,
    structureNotes:
      'Weekly modules with clear learning objectives; one summative assessment per major topic.',
    rubricStyle: 'Criteria-based rubric with 4 performance levels.',
    tone: 'Clear, inclusive, undergraduate-appropriate.',
  });
}

/** Personal creator slug for self-serve onboarding (stable per user). */
export function personalCreatorSlug(userId: string): string {
  return `creator-${userId.slice(0, 8)}`;
}
