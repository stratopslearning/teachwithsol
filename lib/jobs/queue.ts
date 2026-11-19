/**
 * Durable background-job queue (issue #84).
 *
 *   enqueue(kind, { tenantId, payload, dedupeKey })  → row in job_queue, then a drain kick
 *   drain({ kinds, limit })                          → claim rows, run handlers, record outcome
 *
 * Rows are claimed with FOR UPDATE SKIP LOCKED (sol_job_claim), so Inngest,
 * after() and cron drains can run at the same time without double work. A
 * handler that throws is retried with exponential backoff; after maxAttempts
 * the row is marked dead. A worker that dies mid-job loses its claim when
 * `locked_until` passes, and the job is picked up again.
 *
 * Handlers live in lib/jobs/handlers.ts and are loaded lazily, so enqueueing
 * never imports feature code.
 */
import { after } from 'next/server';
import { requireSafeRuntimeRole } from '@/lib/db/assertRuntimeRole';
import { claimJobs, enqueueJob, finishJob, type JobRow } from '@/lib/db/jobQueue';
import { withTenant } from '@/lib/db/tenantContext';
import { jobsBackend } from '@/lib/jobs/backend';
import { inngest } from '@/lib/jobs/client';
import { JOB_KINDS, JOB_SPECS, type JobKind } from '@/lib/jobs/kinds';

export type { JobRow };

export type EnqueueOptions = {
  tenantId: string | null;
  payload?: Record<string, unknown>;
  /** At most one waiting job per (kind, dedupeKey). */
  dedupeKey?: string;
  /** Skip the drain kick (callers that drain inline right after). */
  noKick?: boolean;
};

/** Backoff before retry `attempt` + 1: 30s, 2m, 8m, 32m … capped at 1h. */
export function retryDelaySeconds(attempt: number): number {
  return Math.min(30 * 4 ** Math.max(attempt - 1, 0), 3600);
}

export async function enqueue(kind: JobKind, opts: EnqueueOptions): Promise<string | null> {
  const id = await enqueueJob({
    kind,
    tenantId: opts.tenantId,
    payload: opts.payload ?? {},
    dedupeKey: opts.dedupeKey ?? null,
    maxAttempts: JOB_SPECS[kind].maxAttempts,
  });
  if (!opts.noKick) await kickDrain([kind]);
  return id;
}

function runAfter(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * Ask a worker to drain soon: an Inngest event when that backend is on,
 * otherwise after() in this request. Never throws; the cron drain is the
 * safety net if the kick is lost.
 */
export async function kickDrain(kinds: JobKind[], copies = 1): Promise<void> {
  const n = Math.max(1, Math.min(copies, 5));
  if (jobsBackend() === 'inngest') {
    try {
      await inngest.send(
        Array.from({ length: n }, () => ({ name: 'jobs/drain.requested' as const, data: { kinds } })),
      );
      return;
    } catch (error) {
      console.warn('[jobs] inngest drain kick failed; using after()', { kinds, error });
    }
  }
  for (let i = 0; i < n; i++) {
    runAfter(() =>
      drain({ kinds }).catch((error) => console.error('[jobs] drain failed', { kinds, error })),
    );
  }
}

let runtimeRoleReady: Promise<void> | undefined;
function ensureWorkerRuntimeRole(): Promise<void> {
  runtimeRoleReady ??= requireSafeRuntimeRole().then(() => undefined);
  return runtimeRoleReady;
}

export type DrainResult = { claimed: number; done: number; retried: number; dead: number };

/** Run one claimed job: handler under its tenant, then record the outcome. */
export async function runJob(job: JobRow): Promise<'done' | 'retried' | 'dead'> {
  const spec = JOB_SPECS[job.kind as JobKind];
  let error: string | null = null;
  if (!spec) {
    error = `unknown job kind: ${job.kind}`;
  } else {
    try {
      const { handlers } = await import('@/lib/jobs/handlers');
      const handler = handlers[job.kind as JobKind];
      const ctx = { id: job.id, tenantId: job.tenantId, payload: job.payload, attempt: job.attempts };
      if (job.tenantId) {
        await withTenant(job.tenantId, null, () => handler(ctx));
      } else {
        await handler(ctx);
      }
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[jobs] handler failed', { id: job.id, kind: job.kind, attempt: job.attempts, error });
    }
  }
  const status = await finishJob(job.id, error, retryDelaySeconds(job.attempts));
  if (error === null) return 'done';
  if (status === 'dead') {
    console.error('[jobs] job dead after max attempts', { id: job.id, kind: job.kind, attempts: job.attempts, error });
    return 'dead';
  }
  return 'retried';
}

/**
 * Claim and run ready jobs until none are left, `limit` have run, or the time
 * budget is spent. Jobs run one at a time by default: on Vercel the pool holds
 * a single connection and withTenant checks it out, so parallel jobs in one
 * drain would just queue on it. Parallelism comes from separate drains.
 */
export async function drain(opts: {
  kinds?: JobKind[];
  limit?: number;
  budgetMs?: number;
  concurrency?: number;
} = {}): Promise<DrainResult> {
  await ensureWorkerRuntimeRole();
  const kinds = opts.kinds?.length ? opts.kinds : null;
  const limit = opts.limit ?? 25;
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const concurrency = Math.max(opts.concurrency ?? 1, 1);
  const lockSeconds = Math.max(
    ...(kinds ?? (Object.keys(JOB_SPECS) as JobKind[])).map((k) => JOB_SPECS[k].lockSeconds),
  );
  const out: DrainResult = { claimed: 0, done: 0, retried: 0, dead: 0 };

  while (out.claimed < limit && Date.now() < deadline) {
    const batch = await claimJobs(kinds, Math.min(concurrency, limit - out.claimed), lockSeconds);
    if (batch.length === 0) break;
    out.claimed += batch.length;
    const outcomes = await Promise.all(batch.map((job) => runJob(job)));
    for (const o of outcomes) out[o] += 1;
  }
  // Stopped on the limit or the clock, not an empty queue: hand off to a fresh drain.
  if (out.claimed >= limit || Date.now() >= deadline) {
    await kickDrain(kinds ?? JOB_KINDS);
  }
  return out;
}
