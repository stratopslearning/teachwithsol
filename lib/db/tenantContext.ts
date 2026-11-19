import { AsyncLocalStorage } from 'node:async_hooks';

import { db, drizzleOnClient, pool } from '@/app/db';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ActiveTenant = { tenantId: string; userId: string | null; tx: TransactionClient };
const active = new AsyncLocalStorage<ActiveTenant>();

type SessionClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  release: () => void;
};

/**
 * Run work in one transaction with transaction-local tenant (and optional
 * user) settings, so FORCE RLS policies see `app.tenant_id` / `app.user_id`.
 *
 * The connection is checked out explicitly and BEGIN / set_config / the work /
 * COMMIT all run on it. Relying on `db.transaction` was not safe: Drizzle only
 * pins a connection when `client instanceof Pool`, and when the Neon Pool
 * class is bundled twice that check fails, so each statement went over HTTP
 * on its own (the settings were lost and RLS returned no rows, silently).
 *
 * A nested call for the same tenant reuses the open transaction when it asks
 * for the same user, or for tenant-only context (userId null): the outer
 * transaction already has the tenant pinned, and the serverless pool has one
 * connection, so a second checkout would wait on the first.
 */
export async function withTenant<T>(
  tenantId: string,
  userId: string | null,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  const current = active.getStore();
  if (current && current.tenantId === tenantId && (userId === null || current.userId === userId)) {
    return fn(current.tx);
  }

  return withDbSession(async (client, tx) => {
    const check = await client.query(
      userId
        ? `select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true),
                  nullif(current_setting('app.tenant_id', true), '') as guc`
        : `select set_config('app.tenant_id', $1, true),
                  nullif(current_setting('app.tenant_id', true), '') as guc`,
      userId ? [tenantId, userId] : [tenantId],
    );
    const guc = (check.rows[0]?.guc as string | null | undefined) ?? null;
    if (guc !== tenantId) {
      throw new Error(`withTenant failed to pin app.tenant_id (want=${tenantId}, got=${guc ?? 'null'})`);
    }
    return active.run({ tenantId, userId, tx }, () => fn(tx));
  });
}

/**
 * One transaction on one checked-out connection (BEGIN ... COMMIT), for code
 * that sets its own transaction-local settings. See withTenant for why
 * `db.transaction` isn't used.
 */
export async function withDbSession<T>(
  fn: (client: SessionClient, tx: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = await (pool as unknown as { connect: () => Promise<SessionClient> }).connect();
  try {
    await client.query('BEGIN');
    const tx = drizzleOnClient(client) as unknown as TransactionClient;
    const result = await fn(client, tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
