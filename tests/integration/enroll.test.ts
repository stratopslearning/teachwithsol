/**
 * Database-level integration test for the enrollment unique constraint.
 *
 * The plan requires:
 *   - duplicate enrollment blocked by composite unique index
 *
 * (HTTP-level paths — paid gate, archived section — would require booting
 * Next.js, which we keep out of this suite to keep tests fast. Those are
 * covered by the route-level checks already in code and could be added
 * via a thin fetch-against-localhost test once `npm run dev` is part of
 * CI.)
 */
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  courses,
  sections,
  studentSections,
  users,
} from '@/app/db/schema';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import {
  enrollStudent,
  makeCourse,
  makeSection,
  makeUser,
} from '../helpers/factories';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('student_sections unique constraint', () => {
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
        // Best-effort cleanup; print and continue.
        console.warn('cleanup error', err);
      }
    }
    await closeTestDb();
  });

  it('blocks duplicate (studentId, sectionId) inserts', async () => {
    const student = await makeUser(db, {});
    const course = await makeCourse(db, { title: 'Enroll Test' });
    const section = await makeSection(db, course.id);

    cleanup.push(() => db.delete(studentSections).where(eq(studentSections.studentId, student.id)));
    cleanup.push(() => db.delete(sections).where(eq(sections.id, section.id)));
    cleanup.push(() => db.delete(courses).where(eq(courses.id, course.id)));
    cleanup.push(() => db.delete(users).where(eq(users.id, student.id)));

    await enrollStudent(db, student.id, section.id);
    // Direct insert of the same pair should violate the unique index.
    await expect(
      db.insert(studentSections).values({
        studentId: student.id,
        sectionId: section.id,
        tenantId: section.tenantId ?? course.tenantId ?? course.workspaceId,
      }),
    ).rejects.toThrow();
  });
});
