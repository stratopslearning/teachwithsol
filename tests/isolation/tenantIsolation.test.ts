/**
 * Cross-tenant isolation: DB RLS shadow (when enabled) and app-layer authz.
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

describe.skipIf(skip)('tenant isolation', () => {
  let db: TestDb;
  let fixtureA: TenantFixture;
  let fixtureB: TenantFixture;
  let authorize: typeof import('@/lib/authz/authorize').authorize;
  let professorCanAccessQuiz: typeof import('@/lib/quizAccess').professorCanAccessQuiz;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    (globalThis as { __neonPool__?: unknown }).__neonPool__ = undefined;

    db = getTestDb();
    await ensureRlsShadowPolicies(db);

    fixtureA = await seedTenantFixture(db, 'A');
    fixtureB = await seedTenantFixture(db, 'B');

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

  it('authorize denies tenant B section for instructor in tenant A', async () => {
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

  it('authorize allows tenant A section for instructor in tenant A', async () => {
    const allowed = await authorize(
      { id: fixtureA.professorId },
      'read',
      {
        tenantId: fixtureA.workspaceId,
        scopeType: 'section',
        scopeId: fixtureA.sectionId,
      },
    );
    expect(allowed).toBe(true);
  });

  it('professorCanAccessQuiz denies cross-tenant quiz id', async () => {
    const allowed = await professorCanAccessQuiz(
      { id: fixtureA.professorId },
      fixtureB.quizId,
    );
    expect(allowed).toBe(false);
  });

  it('professorCanAccessQuiz allows same-tenant quiz for owner', async () => {
    const allowed = await professorCanAccessQuiz(
      { id: fixtureA.professorId },
      fixtureA.quizId,
    );
    expect(allowed).toBe(true);
  });

  it('RLS: tenant GUC hides other workspace courses when RLS is on', async () => {
    const client = await db.$client.connect();
    let rlsOn = false;
    let hasSolApp = false;
    try {
      rlsOn = await tableHasRls(client, 'courses');
      hasSolApp = await solAppRoleExists(client);
    } finally {
      client.release();
    }
    if (!rlsOn) {
      expect.fail(
        'courses RLS not enabled — run migrate 0036 on the test branch',
      );
    }
    if (!hasSolApp) {
      expect.fail(
        'sol_app role missing — apply drizzle/0034_app_roles on the test branch',
      );
    }

    const { rows: courseRows } = await withTenantGuc(
      db,
      fixtureA.workspaceId,
      async (c) =>
        c.query<{ id: string }>(
          `SELECT id::text FROM courses WHERE id IN ($1, $2)`,
          [fixtureA.courseId, fixtureB.courseId],
        ),
    );
    const ids = courseRows.map((r) => r.id);
    expect(ids).toContain(fixtureA.courseId);
    expect(ids).not.toContain(fixtureB.courseId);
  });

  it('RLS: tenant GUC hides other tenant attempts when RLS is on', async () => {
    const client = await db.$client.connect();
    let rlsOn = false;
    let hasSolApp = false;
    try {
      rlsOn = await tableHasRls(client, 'attempts');
      hasSolApp = await solAppRoleExists(client);
    } finally {
      client.release();
    }
    if (!rlsOn) {
      expect.fail(
        'attempts RLS not enabled — run migrate 0036 on the test branch',
      );
    }
    if (!hasSolApp) {
      expect.fail(
        'sol_app role missing — apply drizzle/0034_app_roles on the test branch',
      );
    }

    const { rows: attemptRows } = await withTenantGuc(
      db,
      fixtureA.workspaceId,
      async (c) =>
        c.query<{ id: string }>(
          `SELECT id::text FROM attempts WHERE id IN ($1, $2)`,
          [fixtureA.attemptId, fixtureB.attemptId],
        ),
    );
    const ids = attemptRows.map((r) => r.id);
    expect(ids).toContain(fixtureA.attemptId);
    expect(ids).not.toContain(fixtureB.attemptId);
  });
});
