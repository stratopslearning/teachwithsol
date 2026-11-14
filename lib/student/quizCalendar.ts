import { withBasePath } from '@/lib/basePath';
import { fetchActiveSectionIdsForStudentDefiner } from '@/lib/db/bookWriteDefiners';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import {
  fetchStudentAssignmentDuesDefiner,
  fetchStudentQuizDueForSectionsDefiner,
} from '@/lib/db/studentReadDefiners';
import { isQuizListedForStudents } from '@/lib/quizAvailability';
import { isSectionConcluded } from '@/lib/sectionAvailability';
import { normalizeDatabaseDate } from '@/lib/utils';

export type StudentCalendarEvent = {
  id: string;
  quizId: string;
  title: string;
  sectionId: string;
  sectionName: string;
  courseTitle: string;
  /** ISO due instant (quiz endDate, else per-student assignment dueDate). */
  dueAt: string;
  href: string;
};

/**
 * Quizzes due for the student’s active sections.
 * Due = quiz.endDate ?? assignment.dueDate (matches take-window rules).
 */
export async function listStudentQuizDueEvents(
  studentId: string,
): Promise<StudentCalendarEvent[]> {
  const enrolledIds = await fetchActiveSectionIdsForStudentDefiner(studentId);
  if (enrolledIds.length === 0) return [];

  const sections = await fetchSectionsByIds(enrolledIds);
  const active = sections.filter((s) => !isSectionConcluded(s));
  const sectionIds = active.map((s) => s.id);
  if (sectionIds.length === 0) return [];

  const sectionMeta = new Map(
    active.map((s) => [
      s.id,
      {
        name: s.name,
        courseTitle: s.course?.title ?? 'Course',
      },
    ]),
  );

  const links = await fetchStudentQuizDueForSectionsDefiner(sectionIds);
  const listed = links.filter((l) =>
    isQuizListedForStudents({
      isActive: l.isActive,
      startDate: l.startDate,
    }),
  );
  const quizIds = [...new Set(listed.map((l) => l.quizId))];
  if (quizIds.length === 0) return [];

  const studentAssignments = await fetchStudentAssignmentDuesDefiner(
    studentId,
    quizIds,
  );
  const dueByQuiz = new Map(
    studentAssignments.map((a) => [a.quizId, a.dueDate]),
  );

  const events: StudentCalendarEvent[] = [];
  const seen = new Set<string>();

  for (const link of listed) {
    const endDate = normalizeDatabaseDate(link.endDate);
    const assignDue = normalizeDatabaseDate(dueByQuiz.get(link.quizId) ?? null);
    const due = endDate ?? assignDue;
    if (!due) continue;

    const key = `${link.quizId}:${link.sectionId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const meta = sectionMeta.get(link.sectionId) ?? {
      name: link.sectionName || 'Section',
      courseTitle: link.courseTitle || 'Course',
    };

    events.push({
      id: key,
      quizId: link.quizId,
      title: link.title,
      sectionId: link.sectionId,
      sectionName: meta.name,
      courseTitle: meta.courseTitle,
      dueAt: due.toISOString(),
      href: withBasePath(`/dashboard/student/quiz/${link.quizId}`),
    });
  }

  return events.sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );
}
