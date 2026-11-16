import { withTenant } from '@/lib/db/tenantContext';
import { listActiveMembershipsForUser } from '@/lib/workspace/entitlement';

type TenantTx = Parameters<Parameters<typeof withTenant>[2]>[0];

/** Workspaces (tenants) the user holds an active binding in. */
export async function listUserTenantIds(userId: string): Promise<string[]> {
  const memberships = await listActiveMembershipsForUser(userId);
  return [...new Set(memberships.map((m) => m.workspaceId))];
}

/**
 * Run a read in each of the user's tenants and concatenate the results.
 * Under FORCE RLS a plain db read sees no rows, and a user's data can span
 * several workspaces.
 */
export async function readInUserTenants<T>(
  userId: string,
  read: (tx: TenantTx, tenantId: string) => Promise<T[]>,
): Promise<T[]> {
  const tenantIds = await listUserTenantIds(userId);
  const perTenant = await Promise.all(
    tenantIds.map((tenantId) => withTenant(tenantId, userId, (tx) => read(tx, tenantId))),
  );
  return perTenant.flat();
}

/** First match of a single-row read across the user's tenants. */
export async function findInUserTenants<T>(
  userId: string,
  read: (tx: TenantTx, tenantId: string) => Promise<T | undefined | null>,
): Promise<T | null> {
  for (const tenantId of await listUserTenantIds(userId)) {
    const row = await withTenant(tenantId, userId, (tx) => read(tx, tenantId));
    if (row) return row;
  }
  return null;
}
