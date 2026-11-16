/**
 * Phase 2.3 spike: does transaction-local RLS context (withTenant:
 * BEGIN; set_config('app.tenant_id', x, true); …; COMMIT) hold up on Neon's
 * pooled serverless driver under concurrency, versus calling a SECURITY
 * DEFINER function over the HTTP pool path?
 *
 *   SPIKE_DATABASE_URL=postgres://…neon branch… npx tsx scripts/spike/tenant-gucs.ts
 *   options: --workers 50 --iterations 40 --pool-max 10 --fetch (poolQueryViaFetch)
 *
 * Read-only (set_config + SELECTs). Refuses to run against DATABASE_URL so it
 * can't touch the main dev database by accident.
 */
import { randomUUID } from 'node:crypto';
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

const url = process.env.SPIKE_DATABASE_URL;
if (!url) throw new Error('Set SPIKE_DATABASE_URL to a throwaway Neon branch.');
if (url === process.env.DATABASE_URL) {
  throw new Error('SPIKE_DATABASE_URL must not be the main DATABASE_URL.');
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}
const WORKERS = arg('workers', 50);
const ITERATIONS = arg('iterations', 40);
const POOL_MAX = arg('pool-max', 10);

neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
if (process.argv.includes('--fetch')) neonConfig.poolQueryViaFetch = true;

const pool = new Pool({ connectionString: url, max: POOL_MAX, idleTimeoutMillis: 5_000 });
pool.on('error', () => {
  /* idle disconnects are counted per-operation below */
});

type Outcome = 'ok' | 'guc_lost' | 'guc_leaked' | 'error';
const results: Record<string, { outcomes: Record<Outcome, number>; ms: number[]; errors: Map<string, number> }> = {};
function record(kind: string, outcome: Outcome, ms: number, err?: unknown) {
  const r = (results[kind] ??= {
    outcomes: { ok: 0, guc_lost: 0, guc_leaked: 0, error: 0 },
    ms: [],
    errors: new Map(),
  });
  r.outcomes[outcome] += 1;
  r.ms.push(ms);
  if (err) {
    const key = String((err as Error).message ?? err).slice(0, 120);
    r.errors.set(key, (r.errors.get(key) ?? 0) + 1);
  }
}

/** withTenant path: GUC must hold for every statement in the transaction. */
async function tenantTransaction(): Promise<void> {
  const tenant = randomUUID();
  const t0 = performance.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenant]);
    let outcome: Outcome = 'ok';
    for (let s = 0; s < 3; s++) {
      const r = await client.query(
        `select nullif(current_setting('app.tenant_id', true), '') as guc, (select count(*) from courses) as n`,
      );
      if (r.rows[0]?.guc !== tenant) outcome = 'guc_lost';
    }
    await client.query('COMMIT');
    // After COMMIT the transaction-local setting must be gone on this socket.
    const after = await client.query(`select nullif(current_setting('app.tenant_id', true), '') as guc`);
    if (outcome === 'ok' && after.rows[0]?.guc) outcome = 'guc_leaked';
    record('withTenant', outcome, performance.now() - t0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    record('withTenant', 'error', performance.now() - t0, err);
  } finally {
    client.release();
  }
}

/** Definer path: one pooled query, no session state needed. */
async function definerCall(): Promise<void> {
  const t0 = performance.now();
  try {
    await pool.query(`select * from resolve_lti_platform($1, $2)`, [
      'https://spike.invalid',
      randomUUID(),
    ]);
    record('definer', 'ok', performance.now() - t0);
  } catch (err) {
    record('definer', 'error', performance.now() - t0, err);
  }
}

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0);
}

async function main() {
  console.log(
    `workers=${WORKERS} iterations=${ITERATIONS} poolMax=${POOL_MAX} fetch=${Boolean(neonConfig.poolQueryViaFetch)}`,
  );
  const start = performance.now();
  await Promise.all(
    Array.from({ length: WORKERS }, async (_, w) => {
      for (let i = 0; i < ITERATIONS; i++) {
        await ((w + i) % 2 === 0 ? tenantTransaction() : definerCall());
      }
    }),
  );
  const seconds = (performance.now() - start) / 1000;
  for (const [kind, r] of Object.entries(results)) {
    const total = r.ms.length;
    console.log(
      `\n${kind}: ${total} ops  ok=${r.outcomes.ok} guc_lost=${r.outcomes.guc_lost} guc_leaked=${r.outcomes.guc_leaked} error=${r.outcomes.error}` +
        `  p50=${pct(r.ms, 50)}ms p95=${pct(r.ms, 95)}ms p99=${pct(r.ms, 99)}ms`,
    );
    for (const [msg, n] of r.errors) console.log(`  ${n}× ${msg}`);
  }
  console.log(`\n${seconds.toFixed(1)}s total`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
