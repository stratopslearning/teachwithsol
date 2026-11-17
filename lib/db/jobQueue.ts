/**
 * job_queue access (drizzle/0118_job_queue.sql). The table is cross-tenant and
 * closed to the runtime role; these definers are the only way in.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { jobQueue } from '@/app/db/schema';
import { rowFromTable } from '@/lib/db/rowFromTable';
import { parseJsonb, rowsFromExecute } from '@/lib/db/rows';

export type JobRow = typeof jobQueue.$inferSelect;

/** Insert a waiting job; null when one with the same dedupe key already waits. */
export async function enqueueJob(opts: {
  kind: string;
  tenantId: string | null;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  maxAttempts: number;
}): Promise<string | null> {
  const result = await db.execute(sql`
    select sol_job_enqueue(
      ${opts.kind},
      ${opts.tenantId}::uuid,
      ${JSON.stringify(opts.payload)}::jsonb,
      ${opts.dedupeKey},
      ${opts.maxAttempts}::integer
    ) as id
  `);
  return rowsFromExecute<{ id: string | null }>(result)[0]?.id ?? null;
}

/** Claim up to `limit` ready jobs (null kinds = any kind). */
export async function claimJobs(
  kinds: string[] | null,
  limit: number,
  lockSeconds: number,
): Promise<JobRow[]> {
  // drizzle expands JS arrays into a value list, so pass a Postgres array literal.
  const kindsLiteral = kinds ? `{${kinds.join(',')}}` : null;
  const result = await db.execute(sql`
    select to_jsonb(j) as row
    from sol_job_claim(${kindsLiteral}::text[], ${limit}::integer, ${lockSeconds}::integer) j
  `);
  return rowsFromExecute<{ row: unknown }>(result)
    .map((r) => parseJsonb<Record<string, unknown>>(r.row))
    .filter((r): r is Record<string, unknown> => r != null)
    .map((r) => rowFromTable(jobQueue, r));
}

/** Record a run: done when `error` is null, else retry after `retrySeconds` or dead. */
export async function finishJob(
  id: string,
  error: string | null,
  retrySeconds: number,
): Promise<string | null> {
  const result = await db.execute(sql`
    select sol_job_finish(${id}::uuid, ${error}, ${retrySeconds}::integer) as status
  `);
  return rowsFromExecute<{ status: string | null }>(result)[0]?.status ?? null;
}
