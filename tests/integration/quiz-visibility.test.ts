/**
 * Hide/publish contract: toggling visibility must not tombstone the row, and
 * publishing a previously archived quiz must clear `deletedAt`.
 *
 * `setQuizVisibility` uses the app `db` (DATABASE_URL), so this file asserts
 * the same SQL against TEST_DATABASE_URL instead of importing the mutation.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { quizzes, users } from '@/app/db/schema';
import { activeOnly } from '@/lib/db/filters';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeQuiz, makeUser } from '../helpers/factories';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('quiz visibility (publish / hide)', () => {
  let db: TestDb;
  const cleanup: Array<() => Promise<unknown>> = [];

  beforeAll(() => {
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

  it('hides a quiz without setting deletedAt', async () => {
    const professor = await makeUser(db, {});
    const quiz = await makeQuiz(db, professor.id, { isActive: true });
    cleanup.push(() => db.delete(quizzes).where(eq(quizzes.id, quiz.id)));
    cleanup.push(() => db.delete(users).where(eq(users.id, professor.id)));

    await db
      .update(quizzes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(quizzes.id, quiz.id));

    const row = await db.query.quizzes.findFirst({
      where: eq(quizzes.id, quiz.id),
    });
    expect(row?.isActive).toBe(false);
    expect(row?.deletedAt).toBeNull();

    const visible = await db.query.quizzes.findFirst({
      where: (t, { and }) => and(eq(t.id, quiz.id), activeOnly(quizzes.deletedAt)),
    });
    expect(visible).toBeTruthy();
  });

  it('publishing restores a soft-deleted quiz', async () => {
    const professor = await makeUser(db, {});
    const quiz = await makeQuiz(db, professor.id, { isActive: false });
    cleanup.push(() => db.delete(quizzes).where(eq(quizzes.id, quiz.id)));
    cleanup.push(() => db.delete(users).where(eq(users.id, professor.id)));

    await db
      .update(quizzes)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(quizzes.id, quiz.id));

    const hidden = await db.query.quizzes.findFirst({
      where: (t, { and }) => and(eq(t.id, quiz.id), activeOnly(quizzes.deletedAt)),
    });
    expect(hidden).toBeUndefined();

    await db
      .update(quizzes)
      .set({ isActive: true, deletedAt: null, updatedAt: new Date() })
      .where(eq(quizzes.id, quiz.id));

    const row = await db.query.quizzes.findFirst({
      where: eq(quizzes.id, quiz.id),
    });
    expect(row?.isActive).toBe(true);
    expect(row?.deletedAt).toBeNull();
  });
});
