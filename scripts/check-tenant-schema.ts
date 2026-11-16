/**
 * Fail if education tables lack tenant_id or FORCE RLS.
 *   npx tsx scripts/check-tenant-schema.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '.env.local', override: true, quiet: true });

import { TEACHING_TENANT_TABLES } from '../lib/db/tenantTables';
import { assertDevDatabaseOrExit } from './lib/assertDevDatabase';

const EXTRA_REQUIRED = [
  'grade_overrides',
  'regrade_requests',
  'quiz_versions',
  'knowledge_connectors',
  'knowledge_document_versions',
  'knowledge_sync_runs',
  'professor_api_tokens',
  'authoring_policies',
  'audit_log',
  'role_bindings',
] as const;

type AllowEntry = { table: string; reason: string };

async function main() {
  const target = assertDevDatabaseOrExit({
    urlEnvVars: ['TEST_DATABASE_URL', 'DATABASE_MIGRATE_URL', 'DATABASE_URL'],
  });

  const allowlist = JSON.parse(
    readFileSync(resolve(process.cwd(), 'scripts/tenant-schema-allowlist.json'), 'utf8'),
  ) as AllowEntry[];
  for (const entry of allowlist) {
    if (!entry.reason?.trim()) {
      console.error(`[check-tenant-schema] allowlist entry ${entry.table} missing reason`);
      process.exit(1);
    }
  }
  const allowed = new Set(allowlist.map((e) => e.table));

  // Always TCP via node-postgres (works for CI localhost and Neon). Avoids
  // Neon serverless WS against localhost and pg/Neon PoolClient union TS errors.
  const pool = new Pool({ connectionString: target.url });
  const client = await pool.connect();
  const required = new Set<string>([...TEACHING_TENANT_TABLES, ...EXTRA_REQUIRED]);
  const failures: string[] = [];

  try {
    const { rows: tables } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );

    for (const { tablename } of tables) {
      if (allowed.has(tablename)) continue;
      if (!required.has(tablename)) continue;

      const { rows: cols } = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'`,
        [tablename],
      );
      if (cols.length === 0) {
        failures.push(`${tablename}: missing tenant_id`);
        continue;
      }

      const { rows: rls } = await client.query<{
        rowsecurity: boolean;
        forcerowsecurity: boolean;
      }>(
        `SELECT c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [tablename],
      );
      const meta = rls[0];
      if (!meta?.rowsecurity || !meta?.forcerowsecurity) {
        failures.push(
          `${tablename}: RLS ENABLE=${Boolean(meta?.rowsecurity)} FORCE=${Boolean(meta?.forcerowsecurity)}`,
        );
      }
    }

    // Also ensure required tables exist
    const present = new Set(tables.map((t) => t.tablename));
    for (const name of required) {
      if (!present.has(name) && !allowed.has(name)) {
        // soft: table may not exist in older branches
        console.warn(`[check-tenant-schema] required table not present: ${name}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  if (failures.length) {
    console.error('[check-tenant-schema] FAILED');
    for (const f of failures) console.error('  -', f);
    process.exit(1);
  }
  console.log('[check-tenant-schema] OK on', target.host);
}

void main();
