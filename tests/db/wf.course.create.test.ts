import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { courses, roleBindings } from '@/app/db/schema';
import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  cleanupTenantFixture,
  seedTenantGraph,
  type TenantGraph,
} from '../helpers/seedTenantFixture';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('wf.course.create tenant stamp', () => {
  let db: TestDb;
  const graphs: TenantGraph[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
  });

  afterAll(async () => {
    for (const g of graphs) await cleanupTenantFixture(db, g);
    await closeTestDb();
  });

  for (const sku of ['creator', 'department', 'institution'] as const) {
    it(`${sku}: course + offering share workspace tenant_id; lead bound on offering`, async () => {
      const g = await seedTenantGraph(db, {
        sku,
        label: `CC-${sku.slice(0, 3)}`,
        withQuiz: false,
        withStudent: false,
      });
      graphs.push(g);

      const course = await db.query.courses.findFirst({
        where: eq(courses.id, g.courseId),
      });
      expect(course?.tenantId).toBe(g.workspaceId);
      expect(course?.workspaceId).toBe(g.workspaceId);

      const lead = await db.query.roleBindings.findFirst({
        where: eq(roleBindings.userId, g.leadId),
      });
      expect(lead?.role).toBe('lead_instructor');
      expect(lead?.scopeType).toBe('offering');
      expect(lead?.scopeId).toBe(g.offeringId);
      expect(lead?.tenantId).toBe(g.workspaceId);
    });
  }
});
