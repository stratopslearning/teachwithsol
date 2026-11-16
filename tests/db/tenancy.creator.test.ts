import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  cleanupTenantFixture,
  seedTenantGraph,
  type TenantGraph,
} from '../helpers/seedTenantFixture';
import { withTenantGuc } from '../helpers/rlsSetup';
import { courses } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('tenancy.creator', () => {
  let db: TestDb;
  let a: TenantGraph;
  let b: TenantGraph;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    a = await seedTenantGraph(db, { sku: 'creator', label: 'CR-A' });
    b = await seedTenantGraph(db, { sku: 'creator', label: 'CR-B' });
  });

  afterAll(async () => {
    if (a) await cleanupTenantFixture(db, a);
    if (b) await cleanupTenantFixture(db, b);
    await closeTestDb();
  });

  it('stamps tenant_id = creator workspace on course/section/quiz', () => {
    expect(a.workspaceId).toBeTruthy();
    expect(a.sku).toBe('creator');
  });

  it('creator A GUC cannot read creator B course by id', async () => {
    const rows = await withTenantGuc(db, a.workspaceId, async (client) => {
      const r = await client.query(`select id from courses where id = $1`, [
        b.courseId,
      ]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('creator A GUC can read own course', async () => {
    const rows = await withTenantGuc(db, a.workspaceId, async (client) => {
      const r = await client.query(`select id from courses where id = $1`, [
        a.courseId,
      ]);
      return r.rows;
    });
    expect(rows).toHaveLength(1);
  });

  it('drizzle row tenant_id matches workspace', async () => {
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, a.courseId),
    });
    expect(course?.tenantId).toBe(a.workspaceId);
    expect(course?.workspaceId).toBe(a.workspaceId);
  });
});
