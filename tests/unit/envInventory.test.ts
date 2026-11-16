/**
 * lib/env.ts is the one inventory of configuration. This fails when code
 * reads an env var the schema doesn't list, or when .env.example is stale
 * (regenerate with `npm run gen:env-example`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { baseSchema } from '@/lib/env';
import { renderEnvExample } from '../../scripts/gen-env-example';

const ROOT = process.cwd();

/** Set by the platform / toolchain, not by us. */
const PLATFORM_VARS = new Set([
  'NODE_ENV',
  'NEXT_RUNTIME',
  'CI',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'NEXT_PUBLIC_VERCEL_ENV',
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function envVarsReadInCode(): Set<string> {
  const files = [
    ...sourceFiles(join(ROOT, 'app')),
    ...sourceFiles(join(ROOT, 'lib')),
    ...sourceFiles(join(ROOT, 'components')),
    join(ROOT, 'middleware.ts'),
  ];
  const names = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]);
    // Keys read through process.env[key] are listed as string literals.
    if (/process\.env\[/.test(src)) {
      for (const m of src.matchAll(/['"]((?:NEXT_PUBLIC|SOL|OPENAI)_[A-Z0-9_]+)['"]/g)) {
        names.add(m[1]);
      }
    }
  }
  return names;
}

describe('env inventory', () => {
  it('lists every env var the code reads in lib/env.ts', () => {
    const listed = new Set(Object.keys(baseSchema.shape));
    const missing = [...envVarsReadInCode()]
      .filter((n) => !listed.has(n) && !PLATFORM_VARS.has(n))
      .sort();
    expect(missing).toEqual([]);
  });

  it('.env.example matches lib/env.ts', () => {
    const expected = renderEnvExample(readFileSync(join(ROOT, 'lib/env.ts'), 'utf8'));
    const actual = readFileSync(join(ROOT, '.env.example'), 'utf8');
    expect(actual).toBe(expected);
  });
});
