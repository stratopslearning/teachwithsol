/**
 * Write db/functions/<name>.sql from the migrations (the live definition of
 * every SQL function). Run after adding a migration that changes functions.
 *
 *   npm run db:functions:sync
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { liveFunctions, renderFunctionFile } from './lib';

const root = process.cwd();
const dir = join(root, 'db/functions');
mkdirSync(dir, { recursive: true });
const live = liveFunctions(root);
for (const f of readdirSync(dir)) {
  if (f.endsWith('.sql') && !live.has(f.slice(0, -4))) rmSync(join(dir, f));
}
for (const fn of live.values()) {
  writeFileSync(join(dir, `${fn.name}.sql`), renderFunctionFile(fn));
}
console.log(`wrote ${live.size} functions to db/functions/`);
