/**
 * Scoped role bindings: TA cannot escalate; dual-role; platform staff needs support grant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { roleBindings, studentSections, users } from '@/app/db/schema';
import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeSection, makeUser } from '../helpers/factories';
import {
  cleanupTenantFixture,
  seedTenantFixture,
  type TenantFixture,
} from '../helpers/seedTenantFixture';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('role bindings authz', () => {
  let db: TestDb;
  let fixture: TenantFixture;
  let authorize: typeof import('@/lib/authz/authorize').authorize;
  let clearBindingCache: typeof import('@/lib/authz/authorize').clearBindingCache;
  let sectionBId: string;
  let taId: string;
  let graderId: string;
  let adminId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    (globalThis as { __neonPool__?: unknown }).__neonPool__ = undefined;

    db = getTestDb();
    fixture = await seedTenantFixture(db, 'RB');
    const authz = await import('@/lib/authz/authorize');
    authorize = authz.authorize;
    clearBindingCache = authz.clearBindingCache;

    const sectionB = await makeSection(db, fixture.courseId, {
      workspaceId: fixture.workspaceId,
      tenantId: fixture.workspaceId,
      name: 'Section B',
    });
    sectionBId = sectionB.id;

    const ta = await makeUser(db, {
      email: `ta-rb-${Date.now()}@isolation.test`,
    });
    taId = ta.id;
    await db.insert(roleBindings).values({
      tenantId: fixture.workspaceId,
      userId: taId,
      scopeType: 'section',
      scopeId: fixture.sectionId,
      role: 'ta',
    });
  });

  afterAll(async () => {
    if (taId) {
      await db.delete(studentSections).where(eq(studentSections.studentId, taId));
      await db.delete(roleBindings).where(eq(roleBindings.userId, taId));
      await db.delete(users).where(eq(users.id, taId));
    }
    if (graderId) {
      await db.delete(roleBindings).where(eq(roleBindings.userId, graderId));
      await db.delete(users).where(eq(users.id, graderId));
    }
    if (adminId) {
      await db.delete(roleBindings).where(eq(roleBindings.userId, adminId));
      await db.delete(users).where(eq(users.id, adminId));
    }
    if (sectionBId) {
      await db
        .delete((await import('@/app/db/schema')).sections)
        .where(eq((await import('@/app/db/schema')).sections.id, sectionBId))
        .catch(() => undefined);
    }
    if (fixture) await cleanupTenantFixture(db, fixture);
    await closeTestDb();
  });

  it('TA can grade assigned section but not teach another section', async () => {
    clearBindingCache(taId, fixture.workspaceId);
    expect(
      await authorize({ id: taId }, 'grade.write', {
        tenantId: fixture.workspaceId,
        scopeType: 'section',
        scopeId: fixture.sectionId,
      }),
    ).toBe(true);

    expect(
      await authorize({ id: taId }, 'content.write', {
        tenantId: fixture.workspaceId,
        scopeType: 'section',
        scopeId: sectionBId,
      }),
    ).toBe(false);

    expect(
      await authorize({ id: taId }, 'catalog.create_course', {
        tenantId: fixture.workspaceId,
        scopeType: 'organization',
        scopeId: fixture.workspaceId,
      }),
    ).toBe(false);
  });

  it('grader lacks publish and regrade.resolve', async () => {
    const grader = await makeUser(db, {
      email: `grader-rb-${Date.now()}@isolation.test`,
    });
    graderId = grader.id;
    await db.insert(roleBindings).values({
      tenantId: fixture.workspaceId,
      userId: grader.id,
      scopeType: 'section',
      scopeId: fixture.sectionId,
      role: 'grader',
    });
    clearBindingCache(grader.id, fixture.workspaceId);

    expect(
      await authorize({ id: grader.id }, 'grade.write', {
        tenantId: fixture.workspaceId,
        scopeType: 'section',
        scopeId: fixture.sectionId,
      }),
    ).toBe(true);
    expect(
      await authorize({ id: grader.id }, 'content.publish', {
        tenantId: fixture.workspaceId,
        scopeType: 'section',
        scopeId: fixture.sectionId,
      }),
    ).toBe(false);
    expect(
      await authorize({ id: grader.id }, 'regrade.resolve', {
        tenantId: fixture.workspaceId,
        scopeType: 'section',
        scopeId: fixture.sectionId,
      }),
    ).toBe(false);
  });

  it('same user can TA one section and be student on another', async () => {
    await db.insert(studentSections).values({
      studentId: taId,
      sectionId: sectionBId,
      status: 'ACTIVE',
      tenantId: fixture.workspaceId,
    });
    clearBindingCache(taId, fixture.workspaceId);

    expect(
      await authorize({ id: taId }, 'student.submit', {
        tenantId: fixture.workspaceId,
        scopeType: 'section',
        scopeId: sectionBId,
      }),
    ).toBe(true);
    expect(
      await authorize({ id: taId }, 'content.write', {
        tenantId: fixture.workspaceId,
        scopeType: 'section',
        scopeId: sectionBId,
      }),
    ).toBe(false);
  });

  it('platform staff without support grant is denied', async () => {
    expect(
      await authorize(
        { id: fixture.professorId, platformStaff: true },
        'content.read',
        {
          tenantId: fixture.workspaceId,
          scopeType: 'section',
          scopeId: fixture.sectionId,
        },
      ),
    ).toBe(false);
  });

  it('admin binding cannot grade student work', async () => {
    const admin = await makeUser(db, {
      email: `admin-rb-${Date.now()}@isolation.test`,
    });
    adminId = admin.id;
    await db.insert(roleBindings).values({
      tenantId: fixture.workspaceId,
      userId: admin.id,
      scopeType: 'organization',
      scopeId: fixture.workspaceId,
      role: 'admin',
    });
    clearBindingCache(admin.id, fixture.workspaceId);

    expect(
      await authorize({ id: admin.id }, 'audit.read', {
        tenantId: fixture.workspaceId,
        scopeType: 'organization',
        scopeId: fixture.workspaceId,
      }),
    ).toBe(true);
    expect(
      await authorize({ id: admin.id }, 'grade.write', {
        tenantId: fixture.workspaceId,
        scopeType: 'section',
        scopeId: fixture.sectionId,
      }),
    ).toBe(false);
  });
});
