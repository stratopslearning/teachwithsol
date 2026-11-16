/**
 * Read-only check on a branch copy: do recent quiz attempts have real
 * max scores, per tenant? Runs as whatever role SPIKE_DATABASE_URL uses.
 */
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
const pool = new Pool({ connectionString: process.env.SPIKE_DATABASE_URL!, max: 1 });

// workspaces are visible to a session whose app.user_id is a member.
const userIds = (await pool.query('select id::text as id from users')).rows.map((r) => r.id as string);
const tenantSet = new Set<string>(['00000000-0000-4000-8000-000000000001']);
for (const u of userIds) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN READ ONLY');
    await c.query(`select set_config('app.user_id', $1, true)`, [u]);
    for (const r of (await c.query('select id::text as id from workspaces')).rows) tenantSet.add(r.id);
    await c.query('ROLLBACK');
  } finally {
    c.release();
  }
}
const tenants = [...tenantSet];
console.log('users:', userIds.length, 'tenants found:', tenants.length);

for (const t of tenants) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN READ ONLY');
    await c.query(`select set_config('app.tenant_id', $1, true)`, [t]);
    const r = (
      await c.query(`
        select count(*)::int as submitted,
               count(*) filter (where max_score = 0)::int as zero_max,
               count(*) filter (where submitted_at > now() - interval '3 days')::int as last_3d,
               count(*) filter (where submitted_at > now() - interval '3 days' and max_score = 0)::int as last_3d_zero_max,
               max(submitted_at) as latest
        from attempts where submitted_at is not null`)
    ).rows[0];
    const q = (await c.query('select count(*)::int as n from questions')).rows[0].n;
    if (r.submitted > 0 || q > 0) {
      console.log(t.slice(0, 8), { questions: q, ...r, latest: r.latest?.toISOString?.() ?? r.latest });
    }
    await c.query('ROLLBACK');
  } finally {
    c.release();
  }
}
await pool.end();
