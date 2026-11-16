import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { roleBindings } from '@/app/db/schema';
import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeMembership, makeSection, makeUser } from '../helpers/factories';
import {
  cleanupTenantFixture,
  seedTenantGraph,
  type TenantGraph,
} from '../helpers/seedTenantFixture';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('authz.scopes.offeringSection', () => {
  let db: TestDb;
  let graph: TenantGraph;
  let authorize: typeof import('@/lib/authz/authorize').authorize;
  let clearBindingCache: typeof import('@/lib/authz/authorize').clearBindingCache;
  let sectionLeadId: string;
  let offeringTaId: string;
  let sectionBId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    graph = await seedTenantGraph(db, { sku: 'department', label: 'SC' });
    const authz = await import('@/lib/authz/authorize');
    authorize = authz.authorize;
    clearBindingCache = authz.clearBindingCache;

    const sectionB = await makeSection(db, graph.courseId, {
      workspaceId: graph.workspaceId,
      tenantId: graph.workspaceId,
      offeringId: graph.offeringId,
      name: 'Section B scopes',
    });
    sectionBId = sectionB.id;

    const sectionLead = await makeUser(db, {
      email: `sec-lead-${Date.now()}@isolation.test`,
    });
    sectionLeadId = sectionLead.id;
    await makeMembership(db, graph.workspaceId, sectionLeadId);
    await db.insert(roleBindings).values({
      tenantId: graph.workspaceId,
      userId: sectionLeadId,
      scopeType: 'section',
      scopeId: graph.sectionId,
      role: 'lead_instructor',
      grantedBy: graph.ownerId,
    });

    const offeringTa = await makeUser(db, {
      email: `off-ta-${Date.now()}@isolation.test`,
    });
    offeringTaId = offeringTa.id;
    await makeMembership(db, graph.workspaceId, offeringTaId);
    await db.insert(roleBindings).values({
      tenantId: graph.workspaceId,
      userId: offeringTaId,
      scopeType: 'offering',
      scopeId: graph.offeringId,
      role: 'ta',
      grantedBy: graph.ownerId,
    });
  });

  afterAll(async () => {
    if (graph) await cleanupTenantFixture(db, graph);
    await closeTestDb();
  });

  it('lead@section can grade that section but not sibling section', async () => {
    clearBindingCache(sectionLeadId, graph.workspaceId);
    expect(
      await authorize({ id: sectionLeadId }, 'grade.write', {
        tenantId: graph.workspaceId,
        scopeType: 'section',
        scopeId: graph.sectionId,
        offeringId: graph.offeringId,
      }),
    ).toBe(true);
    expect(
      await authorize({ id: sectionLeadId }, 'grade.write', {
        tenantId: graph.workspaceId,
        scopeType: 'section',
        scopeId: sectionBId,
        offeringId: graph.offeringId,
      }),
    ).toBe(false);
  });

  it('ta@offering can grade any section under the offering', async () => {
    clearBindingCache(offeringTaId, graph.workspaceId);
    expect(
      await authorize({ id: offeringTaId }, 'grade.write', {
        tenantId: graph.workspaceId,
        scopeType: 'section',
        scopeId: graph.sectionId,
        offeringId: graph.offeringId,
      }),
    ).toBe(true);
    expect(
      await authorize({ id: offeringTaId }, 'grade.write', {
        tenantId: graph.workspaceId,
        scopeType: 'section',
        scopeId: sectionBId,
        offeringId: graph.offeringId,
      }),
    ).toBe(true);
  });
});
