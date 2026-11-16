/**
 * App-layer cross-tenant denial (authorize + quiz access), no HTTP server required.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { ensureRlsShadowPolicies } from '../helpers/rlsSetup';
import {
  cleanupTenantFixture,
  seedTenantFixture,
  type TenantFixture,
} from '../helpers/seedTenantFixture';
import { makeUser } from '../helpers/factories';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('http cross-tenant (authz layer)', () => {
  let db: TestDb;
  let fixtureA: TenantFixture;
  let fixtureB: TenantFixture;
  let adminNoGrant: { id: string; platformStaff: boolean };
  let authorize: typeof import('@/lib/authz/authorize').authorize;
  let professorCanAccessQuiz: typeof import('@/lib/quizAccess').professorCanAccessQuiz;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    await ensureRlsShadowPolicies(db);

    fixtureA = await seedTenantFixture(db, 'http-A');
    fixtureB = await seedTenantFixture(db, 'http-B');

    const adminUser = await makeUser(db, {
      platformStaff: true,
      email: `admin-no-grant-${Date.now()}@isolation.test`,
    });
    adminNoGrant = { id: adminUser.id, platformStaff: true };

    const authz = await import('@/lib/authz/authorize');
    authorize = authz.authorize;
    const quizAccess = await import('@/lib/quizAccess');
    professorCanAccessQuiz = quizAccess.professorCanAccessQuiz;
  });

  afterAll(async () => {
    if (fixtureA) await cleanupTenantFixture(db, fixtureA);
    if (fixtureB) await cleanupTenantFixture(db, fixtureB);
    await closeTestDb();
  });

  it('authorize denies cross-tenant section read for professor in A viewing B', async () => {
    const allowed = await authorize(
      { id: fixtureA.professorId },
      'read',
      {
        tenantId: fixtureB.workspaceId,
        scopeType: 'section',
        scopeId: fixtureB.sectionId,
      },
    );
    expect(allowed).toBe(false);
  });

  it('professorCanAccessQuiz denies tenant B quiz for professor in A', async () => {
    const allowed = await professorCanAccessQuiz(
      { id: fixtureA.professorId },
      fixtureB.quizId,
    );
    expect(allowed).toBe(false);
  });

  it('professorCanAccessQuiz denies tenant quiz for ADMIN without support grant', async () => {
    const allowed = await professorCanAccessQuiz(adminNoGrant, fixtureA.quizId);
    expect(allowed).toBe(false);
  });
});
