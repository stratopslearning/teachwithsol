/**
 * Alias / consolidation of brokenRouteRls + tenantIsolation RLS half.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  ensureRlsShadowPolicies,
  solAppRoleExists,
  withTenantGuc,
} from '../helpers/rlsSetup';
import {
  cleanupTenantFixture,
  seedTenantFixture,
  type TenantFixture,
} from '../helpers/seedTenantFixture';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('tenancy.rls.crossTenant', () => {
  let db: TestDb;
  let a: TenantFixture;
  let b: TenantFixture;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    await ensureRlsShadowPolicies(db);
    a = await seedTenantFixture(db, 'RLS-A');
    b = await seedTenantFixture(db, 'RLS-B');
  });

  afterAll(async () => {
    if (a) await cleanupTenantFixture(db, a);
    if (b) await cleanupTenantFixture(db, b);
    await closeTestDb();
  });

  it('sol_app role exists', async () => {
    const client = await db.$client.connect();
    try {
      expect(await solAppRoleExists(client)).toBe(true);
    } finally {
      client.release();
    }
  });

  it('tenant A GUC cannot SELECT tenant B quiz by PK', async () => {
    const rows = await withTenantGuc(db, a.workspaceId, async (client) => {
      const r = await client.query(`select id from quizzes where id = $1`, [
        b.quizId,
      ]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('tenant A GUC can SELECT own quiz by PK', async () => {
    const rows = await withTenantGuc(db, a.workspaceId, async (client) => {
      const r = await client.query(`select id from quizzes where id = $1`, [
        a.quizId,
      ]);
      return r.rows;
    });
    expect(rows).toHaveLength(1);
  });
});
