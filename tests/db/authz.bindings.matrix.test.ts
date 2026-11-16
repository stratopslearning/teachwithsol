/**
 * Permission catalog vs authorize() for each binding role on a department graph.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type BindingRole,
  type Permission,
} from '@/lib/authz/permissions';
import { roleBindings } from '@/app/db/schema';
import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeMembership, makeUser } from '../helpers/factories';
import {
  cleanupTenantFixture,
  seedTenantGraph,
  type TenantGraph,
} from '../helpers/seedTenantFixture';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

const SAMPLE_DENY: Partial<Record<BindingRole, Permission>> = {
  faculty: 'grade.write',
  admin: 'grade.write',
  ta: 'content.publish',
  grader: 'roster.read',
  co_instructor: 'staff.remove_lead',
};

describe.skipIf(skip)('authz.bindings.matrix', () => {
  let db: TestDb;
  let graph: TenantGraph;
  let authorize: typeof import('@/lib/authz/authorize').authorize;
  let clearBindingCache: typeof import('@/lib/authz/authorize').clearBindingCache;
  const roleUsers: Partial<Record<BindingRole, string>> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    graph = await seedTenantGraph(db, {
      sku: 'department',
      label: 'MAT',
      withStudent: true,
    });
    const authz = await import('@/lib/authz/authorize');
    authorize = authz.authorize;
    clearBindingCache = authz.clearBindingCache;

    roleUsers.owner = graph.ownerId;
    roleUsers.lead_instructor = graph.leadId;

    for (const role of [
      'admin',
      'faculty',
      'co_instructor',
      'ta',
      'grader',
    ] as BindingRole[]) {
      const u = await makeUser(db, {
        email: `${role}-mat-${Date.now()}@isolation.test`,
      });
      await makeMembership(db, graph.workspaceId, u.id);
      const scopeType =
        role === 'admin' || role === 'faculty'
          ? ('organization' as const)
          : role === 'co_instructor' || role === 'ta' || role === 'grader'
            ? ('offering' as const)
            : ('organization' as const);
      const scopeId =
        scopeType === 'organization' ? graph.workspaceId : graph.offeringId;
      await db.insert(roleBindings).values({
        tenantId: graph.workspaceId,
        userId: u.id,
        scopeType,
        scopeId,
        role,
        grantedBy: graph.ownerId,
      });
      roleUsers[role] = u.id;
    }
  });

  afterAll(async () => {
    if (graph) await cleanupTenantFixture(db, graph);
    await closeTestDb();
  });

  it('ROLE_PERMISSIONS covers every BindingRole', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as Array<
      keyof typeof ROLE_PERMISSIONS
    >) {
      expect(ROLE_PERMISSIONS[role].size).toBeGreaterThan(0);
    }
    expect(PERMISSIONS.length).toBeGreaterThan(10);
  });

  it('lead can grade.write on offering; faculty cannot', async () => {
    clearBindingCache(graph.leadId, graph.workspaceId);
    expect(
      await authorize({ id: graph.leadId }, 'grade.write', {
        tenantId: graph.workspaceId,
        scopeType: 'offering',
        scopeId: graph.offeringId,
      }),
    ).toBe(true);

    const facultyId = roleUsers.faculty!;
    clearBindingCache(facultyId, graph.workspaceId);
    expect(
      await authorize({ id: facultyId }, 'grade.write', {
        tenantId: graph.workspaceId,
        scopeType: 'offering',
        scopeId: graph.offeringId,
      }),
    ).toBe(false);
  });

  it('co_instructor denied staff.remove_lead; lead allowed', async () => {
    const coId = roleUsers.co_instructor!;
    clearBindingCache(coId, graph.workspaceId);
    clearBindingCache(graph.leadId, graph.workspaceId);
    expect(
      await authorize({ id: coId }, 'staff.remove_lead', {
        tenantId: graph.workspaceId,
        scopeType: 'offering',
        scopeId: graph.offeringId,
      }),
    ).toBe(false);
    expect(
      await authorize({ id: graph.leadId }, 'staff.remove_lead', {
        tenantId: graph.workspaceId,
        scopeType: 'offering',
        scopeId: graph.offeringId,
      }),
    ).toBe(true);
  });

  it('student enrollment grants student.submit on section', async () => {
    expect(graph.studentId).toBeTruthy();
    clearBindingCache(graph.studentId!, graph.workspaceId);
    expect(
      await authorize({ id: graph.studentId! }, 'student.submit', {
        tenantId: graph.workspaceId,
        scopeType: 'section',
        scopeId: graph.sectionId,
        offeringId: graph.offeringId,
      }),
    ).toBe(true);
  });

  for (const [role, denyPerm] of Object.entries(SAMPLE_DENY) as [
    BindingRole,
    Permission,
  ][]) {
    it(`${role} is denied ${denyPerm}`, async () => {
      const userId = roleUsers[role];
      if (!userId) return;
      clearBindingCache(userId, graph.workspaceId);
      const allowed = await authorize({ id: userId }, denyPerm, {
        tenantId: graph.workspaceId,
        scopeType: 'offering',
        scopeId: graph.offeringId,
      });
      expect(allowed).toBe(false);
    });
  }
});
