/**
 * Replays drizzle migrations (journal order) and returns the live definition
 * of every SQL function: its latest CREATE [OR REPLACE] FUNCTION plus the
 * ALTER FUNCTION / GRANT / REVOKE statements that apply to it afterwards.
 * DROP FUNCTION removes it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type LiveFunction = {
  name: string;
  /** Migration tag that last defined it. */
  definedIn: string;
  create: string;
  /** Ownership / privilege statements issued after the latest CREATE. */
  privileges: string[];
};

/** Split SQL into statements on `;`, ignoring `;` inside quotes, $$ bodies and comments. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  let dollar: string | null = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        buf += dollar;
        i += dollar.length;
        dollar = null;
      } else {
        buf += ch;
        i += 1;
      }
      continue;
    }
    const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 40));
    if (tag) {
      dollar = tag[0];
      buf += dollar;
      i += dollar.length;
      continue;
    }
    if (ch === "'") {
      const end = sql.indexOf("'", i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      buf += '\n';
      continue;
    }
    if (ch === ';') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const CREATE_RE = /^create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/i;
const DROP_RE = /^drop\s+function\s+(?:if\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i;
const PRIV_RE =
  /^(?:alter\s+function|grant\s+[\w\s,]+?\s+on\s+function|revoke\s+[\w\s,]+?\s+on\s+function)\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/i;

export function journalTags(root: string): string[] {
  const journal = JSON.parse(readFileSync(join(root, 'drizzle/meta/_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  return journal.entries.map((e) => e.tag);
}

export function liveFunctions(root: string): Map<string, LiveFunction> {
  const live = new Map<string, LiveFunction>();
  for (const tag of journalTags(root)) {
    const sql = readFileSync(join(root, 'drizzle', `${tag}.sql`), 'utf8');
    for (const stmt of splitStatements(sql)) {
      const create = CREATE_RE.exec(stmt);
      if (create) {
        const name = create[1].toLowerCase();
        live.set(name, { name, definedIn: tag, create: stmt, privileges: [] });
        continue;
      }
      const drop = DROP_RE.exec(stmt);
      if (drop) {
        live.delete(drop[1].toLowerCase());
        continue;
      }
      const priv = PRIV_RE.exec(stmt);
      if (priv) live.get(priv[1].toLowerCase())?.privileges.push(stmt);
    }
  }
  return live;
}

/** File contents for db/functions/<name>.sql. */
export function renderFunctionFile(fn: LiveFunction): string {
  return [
    `-- Live definition of ${fn.name}() (last changed in drizzle/${fn.definedIn}.sql).`,
    '-- Edit here, then run `npm run db:functions:migrate` to write the migration.',
    '',
    `${fn.create};`,
    ...fn.privileges.map((p) => `${p};`),
    '',
  ].join('\n');
}
