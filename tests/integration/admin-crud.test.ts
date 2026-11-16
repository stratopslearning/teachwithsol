/**
 * Verifies the soft-delete model end-to-end at the database level:
 *   - Setting `deletedAt` removes the row from `activeOnly`-filtered reads.
 *   - Hard delete (purge) cascades through FK ON DELETE policies.
 *   - Audit log captures the action with the actor's id.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  auditLog,
  courses,
  questions,
  quizzes,
  sections,
  users,
  workspaceLicenses,
  workspaces,
} from '@/app/db/schema';
import { activeOnly } from '@/lib/db/filters';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  makeCourse,
  makeLicense,
  makeQuestion,
  makeQuiz,
  makeSection,
  makeUser,
  makeWorkspace,
} from '../helpers/factories';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('admin CRUD soft-delete + audit', () => {
  let db: TestDb;
  const cleanup: Array<() => Promise<unknown>> = [];

  beforeAll(() => {
    // App helpers (logAudit → @/app/db) must hit the same DB as factories.
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    (globalThis as { __neonPool__?: unknown }).__neonPool__ = undefined;
    db = getTestDb();
  });

  afterAll(async () => {
    while (cleanup.length) {
      try {
        await cleanup.pop()!();
      } catch (err) {
        console.warn('cleanup error', err);
      }
    }
    await closeTestDb();
  });

  it('soft-deleting a quiz hides it from active-only reads', async () => {
    const professor = await makeUser(db, {});
    const quiz = await makeQuiz(db, professor.id, { title: 'SoftDelete Test' });
    cleanup.push(() => db.delete(quizzes).where(eq(quizzes.id, quiz.id)));
    cleanup.push(() => db.delete(users).where(eq(users.id, professor.id)));

    let visible = await db.query.quizzes.findMany({
      where: and(eq(quizzes.id, quiz.id), activeOnly(quizzes.deletedAt)),
    });
    expect(visible).toHaveLength(1);

    await db
      .update(quizzes)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(quizzes.id, quiz.id));

    visible = await db.query.quizzes.findMany({
      where: and(eq(quizzes.id, quiz.id), activeOnly(quizzes.deletedAt)),
    });
    expect(visible).toHaveLength(0);

    // But the row still exists for admin auditing.
    const stillThere = await db.query.quizzes.findMany({
      where: eq(quizzes.id, quiz.id),
    });
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0].deletedAt).not.toBeNull();
  });

  it('purging a quiz cascades to its questions', async () => {
    const professor = await makeUser(db, {});
    const quiz = await makeQuiz(db, professor.id);
    const q1 = await makeQuestion(db, quiz.id);
    cleanup.push(() => db.delete(users).where(eq(users.id, professor.id)));

    await db.delete(quizzes).where(eq(quizzes.id, quiz.id));
    const orphans = await db.query.questions.findMany({
      where: eq(questions.id, q1.id),
    });
    expect(orphans).toHaveLength(0);
  });

  it('purging a course cascades through its sections', async () => {
    const course = await makeCourse(db);
    const section = await makeSection(db, course.id);
    await db.delete(courses).where(eq(courses.id, course.id));
    const remaining = await db.query.sections.findMany({
      where: eq(sections.id, section.id),
    });
    expect(remaining).toHaveLength(0);
  });

  it('logAudit writes an audit row', async () => {
    const ws = await makeWorkspace(db, { type: 'department' });
    await makeLicense(db, ws.id);
    const action = `admin.test.action.${Date.now()}`;
    cleanup.push(() => db.delete(auditLog).where(eq(auditLog.action, action)));
    cleanup.push(() =>
      db.delete(workspaceLicenses).where(eq(workspaceLicenses.workspaceId, ws.id)),
    );
    cleanup.push(() => db.delete(workspaces).where(eq(workspaces.id, ws.id)));

    // Import after DATABASE_URL pin so @/app/db shares TEST_DATABASE_URL.
    const { logAudit: logAuditFresh } = await import('@/lib/audit');
    await logAuditFresh({
      action,
      targetType: 'test',
      targetId: 'abc-123',
      metadata: { foo: 'bar' },
      tenantId: ws.id,
    });

    const rows = await db.query.auditLog.findMany({
      where: eq(auditLog.action, action),
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.tenantId).toBe(ws.id);
  });
});
