/**
 * User-scoped reads that must work as sol_app under FORCE RLS without
 * app.tenant_id (onboarding, teaching/learning gates, authorize load).
 * Backed by SECURITY DEFINER functions in drizzle/0049_user_bindings_read.sql.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import type { AuthzScopeType } from '@/lib/authz/authorize';
import type { BindingRole } from '@/lib/authz/permissions';
import { type LicensePlan } from '@/app/db/enums';
import { asDate, rowsFromExecute } from '@/lib/db/rows';

type BindingRow = {
  tenant_id: string;
  role: string;
  scope_type: string;
  scope_id: string;
};

export async function fetchUserRoleBindings(
  userId: string,
  tenantId?: string | null,
): Promise<
  Array<{
    tenantId: string;
    role: BindingRole;
    scopeType: AuthzScopeType;
    scopeId: string;
  }>
> {
  const result = await db.execute(sql`
    SELECT tenant_id, role, scope_type, scope_id
    FROM sol_user_role_bindings(
      ${userId}::uuid,
      ${tenantId ?? null}::uuid
    )
  `);
  return rowsFromExecute<BindingRow>(result).map((r) => ({
    tenantId: r.tenant_id,
    role: r.role as BindingRole,
    scopeType: r.scope_type as AuthzScopeType,
    scopeId: r.scope_id,
  }));
}

export async function userHasAnyActiveEnrollment(
  userId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT sol_user_has_active_enrollment(${userId}::uuid) AS ok
  `);
  const row = rowsFromExecute<{ ok: boolean }>(result)[0];
  return Boolean(row?.ok);
}

export async function userEnrolledInSection(
  userId: string,
  sectionId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT sol_user_enrolled_in_section(
      ${userId}::uuid,
      ${sectionId}::uuid
    ) AS ok
  `);
  const row = rowsFromExecute<{ ok: boolean }>(result)[0];
  return Boolean(row?.ok);
}

export async function fetchUserActiveMembershipWorkspaceIds(
  userId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT workspace_id
    FROM sol_user_active_memberships(${userId}::uuid)
  `);
  return rowsFromExecute<{ workspace_id: string }>(result).map(
    (r) => r.workspace_id,
  );
}

type MembershipDetailRow = {
  membership_id: string;
  membership_role: string;
  membership_status: string;
  membership_created_at: Date | string;
  membership_updated_at: Date | string;
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  workspace_type: string;
  workspace_status: string;
  workspace_parent_id: string | null;
  workspace_settings: Record<string, unknown> | null;
  workspace_created_at: Date | string;
  workspace_updated_at: Date | string;
  license_id: string | null;
  license_plan: string | null;
  license_seat_cap: number | null;
  license_status: string | null;
  license_billing_provider: string | null;
  license_stripe_subscription_id: string | null;
  license_period_end: Date | string | null;
};

/**
 * Active memberships + workspace (+ latest license) without app.tenant_id.
 * Shape matches drizzle relational `with: { workspace: { with: { licenses } } }`.
 */
export async function fetchUserActiveMembershipsDetail(userId: string) {
  const result = await db.execute(sql`
    SELECT *
    FROM sol_user_active_memberships_detail(${userId}::uuid)
  `);
  return rowsFromExecute<MembershipDetailRow>(result).map((r) => ({
    id: r.membership_id,
    workspaceId: r.workspace_id,
    userId,
    role: r.membership_role as
      | 'member'
      | 'owner'
      | 'admin'
      | 'instructor'
      | 'learner',
    status: r.membership_status as 'active' | 'invited' | 'removed',
    createdAt: asDate(r.membership_created_at),
    updatedAt: asDate(r.membership_updated_at),
    workspace: {
      id: r.workspace_id,
      slug: r.workspace_slug,
      name: r.workspace_name,
      type: r.workspace_type as
        | 'creator'
        | 'business'
        | 'department'
        | 'institution',
      status: r.workspace_status as
        | 'trial'
        | 'active'
        | 'suspended'
        | 'churned',
      parentWorkspaceId: r.workspace_parent_id,
      settings: r.workspace_settings,
      createdAt: asDate(r.workspace_created_at),
      updatedAt: asDate(r.workspace_updated_at),
      licenses: r.license_id
        ? [
            {
              id: r.license_id,
              workspaceId: r.workspace_id,
              plan: r.license_plan as LicensePlan,
              seatCap: r.license_seat_cap ?? 0,
              status: (r.license_status ?? 'active') as
                | 'trialing'
                | 'active'
                | 'past_due'
                | 'canceled',
              billingProvider: (r.license_billing_provider ?? 'manual') as
                | 'manual'
                | 'stripe',
              stripeSubscriptionId: r.license_stripe_subscription_id,
              periodEnd: r.license_period_end
                ? asDate(r.license_period_end)
                : null,
            },
          ]
        : [],
    },
  }));
}
