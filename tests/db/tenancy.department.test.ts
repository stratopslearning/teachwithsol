import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  cleanupTenantFixture,
  seedSiblingDepartments,
} from '../helpers/seedTenantFixture';
import { withTenantGuc } from '../helpers/rlsSetup';
import { workspaces } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('tenancy.department', () => {
  let db: TestDb;
  let fixture: Awaited<ReturnType<typeof seedSiblingDepartments>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    fixture = await seedSiblingDepartments(db, 'DEP');
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupTenantFixture(db, fixture.deptA);
      await cleanupTenantFixture(db, fixture.deptB);
      await db
        .delete(workspaces)
        .where(eq(workspaces.id, fixture.institution.id));
    }
    await closeTestDb();
  });

  it('both departments parent to the same institution', () => {
    expect(fixture.deptA.institutionId).toBe(fixture.institution.id);
    expect(fixture.deptB.institutionId).toBe(fixture.institution.id);
    expect(fixture.deptA.workspaceId).not.toBe(fixture.deptB.workspaceId);
  });

  it('sibling department GUC cannot see the other department course', async () => {
    const rows = await withTenantGuc(
      db,
      fixture.deptA.workspaceId,
      async (client) => {
        const r = await client.query(`select id from courses where id = $1`, [
          fixture.deptB.courseId,
        ]);
        return r.rows;
      },
    );
    expect(rows).toHaveLength(0);
  });

  it('leaf tenant_id is the department id not the institution', async () => {
    const course = await withTenantGuc(
      db,
      fixture.deptA.workspaceId,
      async (client) => {
        const r = await client.query(
          `select tenant_id, workspace_id from courses where id = $1`,
          [fixture.deptA.courseId],
        );
        return r.rows[0] as { tenant_id: string; workspace_id: string };
      },
    );
    expect(course.tenant_id).toBe(fixture.deptA.workspaceId);
    expect(course.tenant_id).not.toBe(fixture.institution.id);
  });
});
