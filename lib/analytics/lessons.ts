import { and, eq, inArray } from 'drizzle-orm';

import { withCourseTenant } from '@/lib/db/sectionTenants';
import {
  lessonProgress,
  lessonSections,
  studentSections,
} from '@/app/db/schema';
import { resolveAnalyticsSectionIds } from '@/lib/analytics/access';
import { suppressLessonRows } from '@/lib/analytics/kAnonymity';
import type { AuthUser } from '@/lib/getOrCreateUser';

export type LessonCompletionRow = {
  lessonId: string;
  title: string;
  rosterCount: number;
  neverStarted: number;
  started: number;
  completed: number;
  completionRate: number;
  /** True when the roster is below the k-anonymity minimum (counts redacted). */
  suppressed?: boolean;
};

export async function getLessonCompletion(
  user: AuthUser,
  courseId: string,
  opts?: { sectionId?: string | null },
): Promise<LessonCompletionRow[]> {
  const { sectionIds } = await resolveAnalyticsSectionIds(
    user,
    courseId,
    opts?.sectionId,
  );
  if (sectionIds.length === 0) return [];

  // FORCE RLS: plain db reads return nothing (lesson completion was always
  // empty). Everything here belongs to the course's tenant.
  const read = await withCourseTenant(courseId, user.id, async (tx) => ({
    enrollments: await tx.query.studentSections.findMany({
      where: and(
        inArray(studentSections.sectionId, sectionIds),
        eq(studentSections.status, 'ACTIVE'),
      ),
      columns: { studentId: true, sectionId: true },
    }),
    assignments: await tx.query.lessonSections.findMany({
      where: inArray(lessonSections.sectionId, sectionIds),
      with: {
        lesson: true,
      },
    }),
  }));
  if (!read) return [];
  const { enrollments, assignments } = read;
  const rosterIds = [...new Set(enrollments.map((e) => e.studentId))];

  const byLesson = new Map<
    string,
    { title: string; sectionIds: Set<string> }
  >();
  for (const a of assignments) {
    const lesson = a.lesson;
    if (!lesson || lesson.deletedAt || !lesson.isActive) continue;
    if (lesson.courseId !== courseId) continue;
    const cur = byLesson.get(lesson.id) ?? {
      title: lesson.title,
      sectionIds: new Set<string>(),
    };
    cur.sectionIds.add(a.sectionId);
    byLesson.set(lesson.id, cur);
  }

  if (byLesson.size === 0) return [];

  const lessonIds = [...byLesson.keys()];
  const progressRows =
    rosterIds.length > 0
      ? ((await withCourseTenant(courseId, user.id, (tx) =>
          tx.query.lessonProgress.findMany({
            where: and(
              inArray(lessonProgress.lessonId, lessonIds),
              inArray(lessonProgress.studentId, rosterIds),
            ),
          }),
        )) ?? [])
      : [];

  const progressByLesson = new Map<string, Map<string, string>>();
  for (const p of progressRows) {
    let m = progressByLesson.get(p.lessonId);
    if (!m) {
      m = new Map();
      progressByLesson.set(p.lessonId, m);
    }
    m.set(p.studentId, p.status);
  }

  const rows: LessonCompletionRow[] = [];
  for (const [lessonId, meta] of byLesson) {
    // Roster = students enrolled in any section this lesson is assigned to (within scope)
    const relevantSectionIds = meta.sectionIds;
    const lessonRoster = new Set(
      enrollments
        .filter((e) => relevantSectionIds.has(e.sectionId))
        .map((e) => e.studentId),
    );
    const n = lessonRoster.size;
    const prog = progressByLesson.get(lessonId) ?? new Map();
    let started = 0;
    let completed = 0;
    for (const studentId of lessonRoster) {
      const status = prog.get(studentId);
      if (status === 'COMPLETED') completed += 1;
      else if (status === 'STARTED') started += 1;
    }
    const neverStarted = Math.max(0, n - started - completed);
    rows.push({
      lessonId,
      title: meta.title,
      rosterCount: n,
      neverStarted,
      started,
      completed,
      completionRate: n > 0 ? Math.round((completed / n) * 100) : 0,
    });
  }

  return suppressLessonRows(rows.sort((a, b) => a.title.localeCompare(b.title)));
}
