/**
 * The one way to change the production database schema (#145).
 *
 *   npx tsx scripts/prod-migrate.ts status
 *   npx tsx scripts/prod-migrate.ts apply 0119_rls_gaps --confirm-prod
 *   npx tsx scripts/prod-migrate.ts record 0114_list_pending_knowledge_documents ... --confirm-prod
 *
 * `apply` runs a migration's statements and records it in
 * drizzle.__drizzle_migrations in ONE transaction, with the hash and
 * created_at drizzle-kit expects, so a later `drizzle-kit migrate` never
 * re-runs it. `record` only writes the log row, for migrations that were
 * already applied by hand. Without --confirm-prod both print what they would
 * do and change nothing.
 *
 * Target: DATABASE_MIGRATE_URL, which must be a host listed in PROD_DB_HOSTS.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '.env.local', override: true, quiet: true });

type JournalEntry = { idx: number; when: number; tag: string };

const journal = JSON.parse(
  readFileSync(join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
) as { entries: JournalEntry[] };

function migration(tag: string) {
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) throw new Error(`unknown migration tag: ${tag}`);
  const sql = readFileSync(join(process.cwd(), 'drizzle', `${tag}.sql`), 'utf8');
  return {
    entry,
    hash: createHash('sha256').update(sql).digest('hex'),
    statements: sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean),
  };
}

function target(): string {
  const url = process.env.DATABASE_MIGRATE_URL?.trim();
  if (!url) throw new Error('DATABASE_MIGRATE_URL is not set');
  const host = new URL(url.replace(/^postgres:/, 'postgresql:')).hostname.toLowerCase();
  const prod = (process.env.PROD_DB_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (!prod.some((p) => host === p || host.endsWith(`.${p}`))) {
    throw new Error(`DATABASE_MIGRATE_URL host ${host} is not in PROD_DB_HOSTS; this script is for prod only`);
  }
  console.log(`[prod-migrate] target ${host}`);
  return url;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const confirm = rest.includes('--confirm-prod');
  const tags = rest.filter((a) => !a.startsWith('--'));
  const client = new Client({ connectionString: target() });
  await client.connect();
  try {
    const { rows } = await client.query<{ hash: string; created_at: string }>(
      'select hash, created_at::text from drizzle.__drizzle_migrations',
    );
    const recorded = new Set(rows.map((r) => r.hash));
    const last = Math.max(...rows.map((r) => Number(r.created_at)));

    if (cmd === 'status') {
      const pending = journal.entries.filter((e) => e.when > last);
      console.log(`last recorded created_at: ${last}`);
      console.log(
        pending.length
          ? `drizzle-kit migrate would run: ${pending.map((e) => e.tag).join(', ')}`
          : 'drizzle-kit migrate would run nothing',
      );
      return;
    }
    if ((cmd !== 'apply' && cmd !== 'record') || tags.length === 0) {
      throw new Error('usage: prod-migrate.ts status | apply <tag> | record <tag...> [--confirm-prod]');
    }
    if (cmd === 'apply' && tags.length !== 1) throw new Error('apply takes exactly one tag');

    for (const tag of tags) {
      const m = migration(tag);
      if (recorded.has(m.hash)) {
        console.log(`${tag}: already recorded, skipping`);
        continue;
      }
      const plan = cmd === 'apply' ? `${m.statements.length} statements + log row` : 'log row only';
      if (!confirm) {
        console.log(`${tag}: would ${cmd} (${plan}); re-run with --confirm-prod`);
        continue;
      }
      await client.query('BEGIN');
      try {
        if (cmd === 'apply') for (const s of m.statements) await client.query(s);
        await client.query(
          'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
          [m.hash, m.entry.when],
        );
        await client.query('COMMIT');
        console.log(`${tag}: ${cmd} done`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[prod-migrate] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
