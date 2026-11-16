import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  cleanupTenantFixture,
  seedTenantGraph,
  type TenantGraph,
} from '../helpers/seedTenantFixture';
import { makeMembership, makeUser } from '../helpers/factories';
import { roleBindings } from '@/app/db/schema';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('tenancy.institution', () => {
  let db: TestDb;
  let instGraph: TenantGraph;
  let deptGraph: TenantGraph;
  let authorize: typeof import('@/lib/authz/authorize').authorize;
  let instOwnerOnlyId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();

    instGraph = await seedTenantGraph(db, {
      sku: 'institution',
      label: 'INST',
    });

    deptGraph = await seedTenantGraph(db, {
      sku: 'department',
      label: 'INST-D',
      parentInstitutionId: instGraph.workspaceId,
    });

    // Institution-only owner (no binding on department tenant).
    const instOwner = await makeUser(db, {
      email: `inst-only-owner-${Date.now()}@isolation.test`,
    });
    instOwnerOnlyId = instOwner.id;
    await makeMembership(db, instGraph.workspaceId, instOwner.id);
    await db.insert(roleBindings).values({
      tenantId: instGraph.workspaceId,
      userId: instOwner.id,
      scopeType: 'organization',
      scopeId: instGraph.workspaceId,
      role: 'owner',
      grantedBy: instOwner.id,
    });

    authorize = (await import('@/lib/authz/authorize')).authorize;
  });

  afterAll(async () => {
    if (deptGraph) await cleanupTenantFixture(db, deptGraph);
    if (instGraph) await cleanupTenantFixture(db, instGraph);
    await closeTestDb();
  });

  it('courses on institution workspace stamp institution tenant_id', async () => {
    const { courses } = await import('@/app/db/schema');
    const { eq } = await import('drizzle-orm');
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, instGraph.courseId),
    });
    expect(course?.tenantId).toBe(instGraph.workspaceId);
  });

  it('child department courses stamp department id; parent link does not rewrite', async () => {
    const { courses, workspaces } = await import('@/app/db/schema');
    const { eq } = await import('drizzle-orm');
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, deptGraph.courseId),
    });
    expect(course?.tenantId).toBe(deptGraph.workspaceId);
    expect(course?.tenantId).not.toBe(instGraph.workspaceId);

    const deptWs = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, deptGraph.workspaceId),
    });
    expect(deptWs?.parentWorkspaceId).toBe(instGraph.workspaceId);
  });

  it('institution-only owner cannot authorize on department course section', async () => {
    const allowed = await authorize(
      { id: instOwnerOnlyId },
      'content.read',
      {
        tenantId: deptGraph.workspaceId,
        scopeType: 'section',
        scopeId: deptGraph.sectionId,
        offeringId: deptGraph.offeringId,
      },
    );
    expect(allowed).toBe(false);
  });
});
