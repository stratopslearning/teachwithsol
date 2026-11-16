/**
 * Wave tests: sol_app bare writes fail; DEFINERs succeed; cross-tenant
 * payload rejected; offering TA listed; platform append_audit RETURNING.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  ensureRlsShadowPolicies,
  solAppRoleExists,
} from '../helpers/rlsSetup';
import {
  cleanupTenantFixture,
  seedTenantFixture,
  type TenantFixture,
} from '../helpers/seedTenantFixture';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('rls.facultyDefiners', () => {
  let db: TestDb;
  let a: TenantFixture;
  let b: TenantFixture;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    await ensureRlsShadowPolicies(db);
    a = await seedTenantFixture(db, 'DEF-A');
    b = await seedTenantFixture(db, 'DEF-B');
  });

  afterAll(async () => {
    if (a) await cleanupTenantFixture(db, a);
    if (b) await cleanupTenantFixture(db, b);
    await closeTestDb();
  });

  it('sol_app bare insert into course_offerings fails without tenant GUC', async () => {
    const client = await db.$client.connect();
    try {
      expect(await solAppRoleExists(client)).toBe(true);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sol_app');
      // Clear any inherited GUC
      await client.query(`SELECT set_config('app.tenant_id', '', true)`);
      let failed = false;
      try {
        await client.query(
          `INSERT INTO course_offerings (course_id, tenant_id, term_label, status)
           VALUES ($1, $2, 'bare-fail', 'active')`,
          [a.courseId, a.workspaceId],
        );
      } catch {
        failed = true;
      }
      await client.query('ROLLBACK');
      expect(failed).toBe(true);
    } finally {
      client.release();
    }
  });

  it('sol_ensure_offering DEFINER succeeds for sol_app', async () => {
    const client = await db.$client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sol_app');
      const { rows } = await client.query<{ row: { id: string; termLabel: string } }>(
        `SELECT sol_ensure_offering($1::jsonb) AS row`,
        [
          JSON.stringify({
            courseId: a.courseId,
            tenantId: a.workspaceId,
            termLabel: `definer-${Date.now()}`,
          }),
        ],
      );
      const raw = rows[0]?.row;
      const parsed =
        typeof raw === 'string' ? JSON.parse(raw) : (raw as { id?: string });
      expect(parsed?.id).toBeTruthy();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('sol_ensure_offering rejects cross-tenant payload', async () => {
    const client = await db.$client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sol_app');
      let message = '';
      try {
        await client.query(`SELECT sol_ensure_offering($1::jsonb)`, [
          JSON.stringify({
            courseId: a.courseId,
            tenantId: b.workspaceId,
            termLabel: 'cross-tenant',
          }),
        ]);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      await client.query('ROLLBACK');
      expect(message).toMatch(/tenantId does not match course/i);
    } finally {
      client.release();
    }
  });

  it('offering-scoped TA appears in sol_user_teaching_section_ids', async () => {
    const client = await db.$client.connect();
    try {
      const tag = `ta-${Date.now()}`;
      const {
        rows: [ta],
      } = await client.query<{ id: string }>(
        `INSERT INTO users (clerk_id, email, first_name, last_name)
         VALUES ($1, $2, 'TA', 'Offering') RETURNING id`,
        [`clerk_${tag}`, `${tag}@example.com`],
      );
      await client.query(
        `INSERT INTO role_bindings (tenant_id, user_id, scope_type, scope_id, role)
         VALUES ($1, $2, 'offering', $3, 'ta')`,
        [a.workspaceId, ta.id, a.offeringId],
      );

      const { rows } = await client.query<{ section_id: string }>(
        `SELECT section_id FROM sol_user_teaching_section_ids($1::uuid)`,
        [ta.id],
      );
      expect(rows.map((r) => r.section_id)).toContain(a.sectionId);

      await client.query(`DELETE FROM role_bindings WHERE user_id = $1`, [ta.id]);
      // Skip users delete: audit_log forbids actor FK nulling.
    } finally {
      client.release();
    }
  });

  it('platform append_audit RETURNING works under sol_app', async () => {
    const client = await db.$client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sol_app');
      // 0068: platform rows need SELECT policy for RETURNING
      const { rows } = await client.query<{ id: string }>(
        `SELECT append_audit(
           $1::uuid, NULL, 'test.platform.audit', 'system', NULL,
           NULL::jsonb, NULL::uuid, NULL, NULL, true
         ) AS id`,
        [a.professorId],
      );
      expect(rows[0]?.id).toBeTruthy();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('sol_set_quiz_sections rejects cross-tenant sectionIds', async () => {
    const client = await db.$client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sol_app');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        a.workspaceId,
      ]);
      const {
        rows: [quiz],
      } = await client.query<{ id: string }>(
        `INSERT INTO quizzes (title, professor_id, tenant_id, max_attempts, passing_score, is_active)
         VALUES ('cross-tenant-assign', $1, $2, 1, 60, true)
         RETURNING id`,
        [a.professorId, a.workspaceId],
      );
      let message = '';
      try {
        await client.query(`SELECT sol_set_quiz_sections($1::jsonb)`, [
          JSON.stringify({
            quizId: quiz.id,
            assignedBy: a.professorId,
            sectionIds: [b.sectionId],
          }),
        ]);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).toMatch(/Section tenant mismatch/i);
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* already idle */
      }
      client.release();
    }
  });

  it('sol_app bare role_bindings insert fails; DEFINER upsert succeeds', async () => {
    const client = await db.$client.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sol_app');
      await client.query(`SELECT set_config('app.tenant_id', '', true)`);

      // Expected RLS failure aborts the subxact; SAVEPOINT keeps the outer txn usable.
      await client.query('SAVEPOINT bare_insert');
      let bareFailed = false;
      try {
        await client.query(
          `INSERT INTO role_bindings (tenant_id, user_id, scope_type, scope_id, role)
           VALUES ($1, $2, 'section', $3, 'grader')`,
          [a.workspaceId, a.professorId, a.sectionId],
        );
      } catch {
        bareFailed = true;
        await client.query('ROLLBACK TO SAVEPOINT bare_insert');
      }
      expect(bareFailed).toBe(true);

      const { rows } = await client.query<{ row: { bindingId: string } }>(
        `SELECT sol_upsert_role_binding($1::jsonb) AS row`,
        [
          JSON.stringify({
            tenantId: a.workspaceId,
            userId: a.professorId,
            scopeType: 'section',
            scopeId: a.sectionId,
            role: 'grader',
            grantedBy: a.professorId,
          }),
        ],
      );
      const raw = rows[0]?.row;
      const parsed =
        typeof raw === 'string'
          ? JSON.parse(raw)
          : (raw as { bindingId?: string });
      expect(parsed?.bindingId).toBeTruthy();
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* already idle */
      }
      client.release();
    }
  });
});
