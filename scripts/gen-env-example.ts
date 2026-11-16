/**
 * Write .env.example from the schema in lib/env.ts (keys in schema order,
 * with the comment lines above each key). Values are left blank.
 *
 *   npm run gen:env-example
 *
 * tests/unit/envInventory.test.ts fails when .env.example is out of date.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function renderEnvExample(envSource: string): string {
  const lines = envSource.split('\n');
  const start = lines.findIndex((l) => l.startsWith('export const baseSchema = z.object({'));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('});'));
  const out: string[] = [
    '# Generated from lib/env.ts by `npm run gen:env-example`. Do not edit by hand.',
    '# Copy to .env.local and fill in what you need; everything optional can stay blank.',
    '',
  ];
  let comment: string[] = [];
  for (const raw of lines.slice(start + 1, end)) {
    const line = raw.trim();
    const key = /^([A-Z][A-Z0-9_]*):/.exec(line);
    if (key) {
      out.push(...comment, `${key[1]}=`);
      comment = [];
      continue;
    }
    if (line.startsWith('//')) {
      const text = line.replace(/^\/\/\s?/, '');
      if (/^-+$/.test(text)) continue;
      comment.push(text ? `# ${text}` : '#');
    } else if (line.startsWith('/**') || line.startsWith('*')) {
      const text = line.replace(/^\/\*\*\s?|^\*\/?\s?|\s*\*\/$/g, '').trim();
      if (text) comment.push(`# ${text}`);
    } else if (line === '') {
      if (comment.length) comment.push('');
      else if (out[out.length - 1] !== '') out.push('');
    }
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

if (process.argv[1]?.endsWith('gen-env-example.ts')) {
  const root = process.cwd();
  const text = renderEnvExample(readFileSync(join(root, 'lib/env.ts'), 'utf8'));
  writeFileSync(join(root, '.env.example'), text);
  console.log('wrote .env.example');
}
