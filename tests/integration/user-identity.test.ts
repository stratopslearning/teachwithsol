/**
 * User identity: unique email index + login relink behavior (DB-level).
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { quizzes, users } from '@/app/db/schema';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeQuiz, makeUser } from '../helpers/factories';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('user email uniqueness + delete reassignment', () => {
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

  it('rejects a second user row with the same email (case-insensitive)', async () => {
    const email = `vitest-unique-${Date.now()}@example.edu`;
    const first = await makeUser(db, {
      email,
    });
    cleanup.push(() => db.delete(users).where(eq(users.id, first.id)));

    await expect(
      makeUser(db, {
        email: email.toUpperCase(),
      }),
    ).rejects.toThrow();
  });

  it('relinks clerk_id onto an existing email row (login repair path)', async () => {
    const email = `vitest-relink-${Date.now()}@example.edu`;
    const row = await makeUser(db, { email });
    cleanup.push(() => db.delete(users).where(eq(users.id, row.id)));

    const newClerkId = `clerk_relink_${Date.now()}`;
    const [updated] = await db
      .update(users)
      .set({ clerkId: newClerkId, updatedAt: new Date() })
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .returning();

    expect(updated.id).toBe(row.id);
    expect(updated.clerkId).toBe(newClerkId);
  });

  it('can delete a professor after reassigning owned quizzes to an admin', async () => {
    const professor = await makeUser(db, {});
    const admin = await makeUser(db, { platformStaff: true });
    const quiz = await makeQuiz(db, professor.id, { title: 'Reassign on delete' });
    cleanup.push(() => db.delete(quizzes).where(eq(quizzes.id, quiz.id)));
    cleanup.push(() => db.delete(users).where(eq(users.id, admin.id)));

    await db
      .update(quizzes)
      .set({ professorId: admin.id })
      .where(eq(quizzes.professorId, professor.id));
    await db.delete(users).where(eq(users.id, professor.id));

    const gone = await db.query.users.findFirst({
      where: eq(users.id, professor.id),
    });
    expect(gone).toBeUndefined();

    const kept = await db.query.quizzes.findFirst({
      where: eq(quizzes.id, quiz.id),
    });
    expect(kept?.professorId).toBe(admin.id);
  });
});
