/**
 * Simulates a handler that forgets an app-layer tenant filter but sets the
 * per-request GUC. RLS should still block cross-tenant reads by primary key.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  ensureRlsShadowPolicies,
  solAppRoleExists,
  tableHasRls,
  withTenantGuc,
} from '../helpers/rlsSetup';
import {
  cleanupTenantFixture,
  seedTenantFixture,
  type TenantFixture,
} from '../helpers/seedTenantFixture';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('broken route (missing app filter, RLS + GUC)', () => {
  let db: TestDb;
  let fixtureA: TenantFixture;
  let fixtureB: TenantFixture;
  let solAppPresent = false;
  let coursesRls = false;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    await ensureRlsShadowPolicies(db);

    const client = await db.$client.connect();
    try {
      solAppPresent = await solAppRoleExists(client);
      coursesRls = await tableHasRls(client, 'courses');
    } finally {
      client.release();
    }

    fixtureA = await seedTenantFixture(db, 'broken-A');
    fixtureB = await seedTenantFixture(db, 'broken-B');
  });

  afterAll(async () => {
    if (fixtureA) await cleanupTenantFixture(db, fixtureA);
    if (fixtureB) await cleanupTenantFixture(db, fixtureB);
    await closeTestDb();
  });

  it('blocks cross-tenant course read by id when GUC is tenant A', async () => {
    if (!coursesRls) {
      expect.fail(
        'courses RLS off — apply migrate 0036 on the test branch',
      );
    }
    if (!solAppPresent) {
      expect.fail(
        'sol_app role missing — apply drizzle/0034_app_roles on the test branch',
      );
    }

    const { rows } = await withTenantGuc(db, fixtureA.workspaceId, (c) =>
      c.query<{ id: string }>(`SELECT id::text FROM courses WHERE id = $1`, [
        fixtureB.courseId,
      ]),
    );
    expect(rows).toHaveLength(0);
  });

  it('blocks cross-tenant quiz read by id when GUC is tenant A', async () => {
    const client = await db.$client.connect();
    let quizzesRls = false;
    try {
      quizzesRls = await tableHasRls(client, 'quizzes');
    } finally {
      client.release();
    }
    if (!quizzesRls) {
      expect.fail('quizzes RLS off — apply migrate 0036 on the test branch');
    }
    if (!solAppPresent) {
      expect.fail(
        'sol_app role missing — apply drizzle/0034_app_roles on the test branch',
      );
    }

    const { rows } = await withTenantGuc(db, fixtureA.workspaceId, (c) =>
      c.query<{ id: string }>(`SELECT id::text FROM quizzes WHERE id = $1`, [
        fixtureB.quizId,
      ]),
    );
    expect(rows).toHaveLength(0);
  });
});
