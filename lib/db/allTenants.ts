import { fetchAdminWorkspaceDirectory } from '@/lib/admin/platformReads';

/**
 * Every workspace id, for system jobs (cron / workers) that sweep all tenants.
 * Under FORCE RLS a worker can't read across tenants with one plain query;
 * it reads each tenant under withTenant instead.
 */
export async function listAllTenantIds(): Promise<string[]> {
  const rows = await fetchAdminWorkspaceDirectory();
  return rows.map((w) => w.id);
}
