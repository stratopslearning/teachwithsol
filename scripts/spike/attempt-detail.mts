/** Read-only: detail for submitted attempts in one tenant (branch copy). */
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
const pool = new Pool({ connectionString: process.env.SPIKE_DATABASE_URL!, max: 1 });
const prefix = process.argv[2] ?? (() => { throw new Error('usage: pass a workspace id prefix'); })();

const c = await pool.connect();
await c.query('BEGIN READ ONLY');
const users = (await c.query('select id::text as id from users')).rows.map((r) => r.id);
let tenant: string | null = null;
for (const u of users) {
  await c.query(`select set_config('app.user_id', $1, true)`, [u]);
  const hit = (await c.query(`select id::text as id from workspaces where id::text like $1 || '%'`, [prefix])).rows[0];
  if (hit) {
    tenant = hit.id;
    break;
  }
}
if (!tenant) throw new Error('tenant not found');
await c.query(`select set_config('app.tenant_id', $1, true)`, [tenant]);
const rows = (
  await c.query(`
    select a.submitted_at, a.score, a.max_score, a.grading_status,
           (select count(*)::int from questions q where q.quiz_id = a.quiz_id) as quiz_questions,
           (select coalesce(sum(q.points),0)::int from questions q where q.quiz_id = a.quiz_id) as quiz_points
    from attempts a
    where a.submitted_at is not null
    order by a.submitted_at`)
).rows;
console.table(rows.map((r) => ({ ...r, submitted_at: new Date(r.submitted_at).toISOString() })));
await c.query('ROLLBACK');
c.release();
await pool.end();
