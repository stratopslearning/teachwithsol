/**
 * db/functions/*.sql must match the migrations. If this fails:
 *   - you edited a function file: run `npm run db:functions:migrate -- name`
 *     then `npm run db:functions:sync`
 *   - you changed a function in a migration: run `npm run db:functions:sync`
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { liveFunctions, renderFunctionFile } from '../../scripts/db-functions/lib';

const root = process.cwd();
const dir = join(root, 'db/functions');

describe('db/functions', () => {
  const live = liveFunctions(root);

  it('has one file per live SQL function, matching the migrations', () => {
    const stale: string[] = [];
    for (const fn of live.values()) {
      const path = join(dir, `${fn.name}.sql`);
      if (!existsSync(path) || readFileSync(path, 'utf8') !== renderFunctionFile(fn)) {
        stale.push(fn.name);
      }
    }
    expect(stale).toEqual([]);
  });

  it('has no files for functions the migrations dropped', () => {
    const orphans = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.slice(0, -4))
      .filter((name) => !live.has(name));
    expect(orphans).toEqual([]);
  });
});
