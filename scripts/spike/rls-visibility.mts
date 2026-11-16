import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
const pool = new Pool({ connectionString: process.env.SPIKE_DATABASE_URL!, max: 1 });
const count = async (sql: string) => (await pool.query(sql)).rows[0]?.n;

console.log('role:', (await pool.query('select current_user as u')).rows[0].u);
for (const table of ['questions', 'attempts', 'quizzes', 'users']) {
  console.log(`${table} visible with no tenant set:`, await count(`select count(*)::int as n from ${table}`));
}
await pool.end();
