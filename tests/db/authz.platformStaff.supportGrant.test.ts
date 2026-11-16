import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeUser } from '../helpers/factories';
import {
  cleanupTenantFixture,
  grantSupportAccess,
  seedTenantGraph,
  type TenantGraph,
} from '../helpers/seedTenantFixture';
import { supportAccessGrants } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('authz.platformStaff.supportGrant', () => {
  let db: TestDb;
  let graph: TenantGraph;
  let staffId: string;
  let authorize: typeof import('@/lib/authz/authorize').authorize;
  let clearBindingCache: typeof import('@/lib/authz/authorize').clearBindingCache;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    graph = await seedTenantGraph(db, { sku: 'department', label: 'SG' });
    const staff = await makeUser(db, {
      platformStaff: true,
      email: `staff-sg-${Date.now()}@isolation.test`,
    });
    staffId = staff.id;
    const authz = await import('@/lib/authz/authorize');
    authorize = authz.authorize;
    clearBindingCache = authz.clearBindingCache;
  });

  afterAll(async () => {
    if (staffId) {
      await db
        .delete(supportAccessGrants)
        .where(eq(supportAccessGrants.userId, staffId));
      await db.delete((await import('@/app/db/schema')).users).where(
        eq((await import('@/app/db/schema')).users.id, staffId),
      );
    }
    if (graph) await cleanupTenantFixture(db, graph);
    await closeTestDb();
  });

  it('platform staff without grant cannot authorize tenant data', async () => {
    clearBindingCache(staffId, graph.workspaceId);
    const allowed = await authorize(
      { id: staffId, platformStaff: true },
      'content.read',
      {
        tenantId: graph.workspaceId,
        scopeType: 'section',
        scopeId: graph.sectionId,
        offeringId: graph.offeringId,
      },
    );
    expect(allowed).toBe(false);
  });

  it('platform staff with active grant can authorize', async () => {
    await grantSupportAccess(db, {
      tenantId: graph.workspaceId,
      userId: staffId,
      grantedBy: graph.ownerId,
    });
    clearBindingCache(staffId, graph.workspaceId);
    const allowed = await authorize(
      { id: staffId, platformStaff: true },
      'content.read',
      {
        tenantId: graph.workspaceId,
        scopeType: 'section',
        scopeId: graph.sectionId,
        offeringId: graph.offeringId,
      },
    );
    expect(allowed).toBe(true);
  });

  it('expired grant denies access', async () => {
    await db
      .delete(supportAccessGrants)
      .where(eq(supportAccessGrants.userId, staffId));
    await grantSupportAccess(db, {
      tenantId: graph.workspaceId,
      userId: staffId,
      grantedBy: graph.ownerId,
      expiresAt: new Date(Date.now() - 60_000),
    });
    clearBindingCache(staffId, graph.workspaceId);
    const allowed = await authorize(
      { id: staffId, platformStaff: true },
      'content.read',
      {
        tenantId: graph.workspaceId,
        scopeType: 'section',
        scopeId: graph.sectionId,
        offeringId: graph.offeringId,
      },
    );
    expect(allowed).toBe(false);
  });
});
