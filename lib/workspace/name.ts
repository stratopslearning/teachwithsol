import { eq } from 'drizzle-orm';

import { workspaces } from '@/app/db/schema';
import { withTenant } from '@/lib/db/tenantContext';

/**
 * A workspace's name, read under its own tenant. Under FORCE RLS a plain db
 * read found nothing, so invite emails went out without the workspace name.
 */
export async function getWorkspaceName(workspaceId: string): Promise<string | null> {
  const row = await withTenant(workspaceId, null, (tx) =>
    tx.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
      columns: { name: true },
    }),
  );
  return row?.name ?? null;
}
