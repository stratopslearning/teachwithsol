/**
 * drizzle/0119 (#143, #144): grading_batches, grading_override_examples and
 * unit_insights are tenant-isolated under sol_app; the formerly PUBLIC
 * definers are sol_app-only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeWorkspace } from '../helpers/factories';
import { withTenantGuc } from '../helpers/rlsSetup';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('RLS on audit-gap tables', () => {
  let db: TestDb;
  let a: string;
  let b: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    a = (await makeWorkspace(db)).id;
    b = (await makeWorkspace(db)).id;
    for (const t of [a, b]) {
      await withTenantGuc(db, t, (c) =>
        c.query(`insert into grading_batches (tenant_id, status) values ($1, 'pending')`, [t]),
      );
    }
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it.each(['grading_batches', 'grading_override_examples', 'unit_insights'])(
    '%s has FORCE RLS',
    async (table) => {
      const client = await db.$client.connect();
      try {
        const { rows } = await client.query(
          `select relrowsecurity, relforcerowsecurity from pg_class where relname = $1`,
          [table],
        );
        expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
      } finally {
        client.release();
      }
    },
  );

  it('a tenant sees only its own grading batches', async () => {
    const seen = await withTenantGuc(db, a, (c) =>
      c.query<{ tenant_id: string }>(`select tenant_id from grading_batches`),
    );
    expect(seen.rows.length).toBeGreaterThan(0);
    expect(new Set(seen.rows.map((r) => r.tenant_id))).toEqual(new Set([a]));
  });

  it("a tenant can't write another tenant's rows", async () => {
    await expect(
      withTenantGuc(db, a, (c) =>
        c.query(`insert into grading_batches (tenant_id, status) values ($1, 'pending')`, [b]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('the formerly PUBLIC definers are no longer executable by PUBLIC', async () => {
    const client = await db.$client.connect();
    try {
      const { rows } = await client.query<{ sig: string }>(
        `select p.oid::regprocedure::text as sig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef
           and has_function_privilege('public', p.oid, 'EXECUTE')`,
      );
      expect(rows.map((r) => r.sig)).toEqual([]);
    } finally {
      client.release();
    }
  });
});
