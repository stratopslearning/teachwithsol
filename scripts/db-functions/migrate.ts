/**
 * Turn edits in db/functions/*.sql into a new drizzle migration.
 *
 *   1. edit db/functions/sol_something.sql
 *   2. npm run db:functions:migrate -- short_description
 *   3. npm run db:functions:sync   (re-stamps the file headers)
 *
 * Only files whose body differs from the migrations are included.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { liveFunctions, renderFunctionFile } from './lib';

const root = process.cwd();
const label = (process.argv[2] ?? 'functions').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
const live = liveFunctions(root);
const dir = join(root, 'db/functions');

const body = (text: string) => text.split('\n').filter((l) => !l.startsWith('-- ')).join('\n').trim();

const changed: string[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  const name = f.slice(0, -4);
  const file = readFileSync(join(dir, f), 'utf8');
  const current = live.get(name);
  if (!current || body(file) !== body(renderFunctionFile(current))) changed.push(body(file));
}
if (changed.length === 0) {
  console.log('db/functions matches the migrations; nothing to do.');
  process.exit(0);
}

const journalPath = join(root, 'drizzle/meta/_journal.json');
const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
const idx = journal.entries.length;
const tag = `${String(idx).padStart(4, '0')}_${label}`;
const statements = changed.flatMap((text) =>
  text.split(/;\n(?=(?:CREATE|ALTER|GRANT|REVOKE)\b)/i).map((s) => s.replace(/;\s*$/, '')),
);
writeFileSync(join(root, 'drizzle', `${tag}.sql`), `${statements.join(';\n--> statement-breakpoint\n')};\n`);
journal.entries.push({
  idx,
  version: journal.entries[idx - 1]?.version ?? '7',
  when: Date.now(),
  tag,
  breakpoints: true,
});
writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
console.log(`wrote drizzle/${tag}.sql (${changed.length} function(s)). Now run npm run db:functions:sync.`);
