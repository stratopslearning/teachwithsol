import { fetchActiveSectionIdsForStudentDefiner } from '@/lib/db/bookWriteDefiners';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import {
  fetchLessonFlashcardsDefiner,
  fetchLessonProgressForStudentDefiner,
  fetchStudentLessonsForSectionsDefiner,
  listChapterSectionProgressDefiner,
} from '@/lib/db/studentReadDefiners';
import { assertStudentCanAccessLesson } from '@/lib/learning/access';
import { isSectionConcluded } from '@/lib/sections/availability';

export type StudentLessonListItem = {
  id: string;
  title: string;
  courseTitle: string;
  sectionNames: string[];
  flashcardCount: number;
  progressStatus: 'open' | 'STARTED' | 'COMPLETED';
};

export async function listStudentLessons(
  studentId: string,
): Promise<StudentLessonListItem[]> {
  const enrolledIds = await fetchActiveSectionIdsForStudentDefiner(studentId);
  if (enrolledIds.length === 0) return [];

  const sections = await fetchSectionsByIds(enrolledIds);
  const sectionIds = sections
    .filter((s) => !isSectionConcluded(s))
    .map((s) => s.id);
  if (sectionIds.length === 0) return [];

  const assignments = await fetchStudentLessonsForSectionsDefiner(sectionIds);
  const activeSectionIdSet = new Set(sectionIds);
  const seen = new Set<string>();
  const rows: StudentLessonListItem[] = [];

  for (const a of assignments) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);

    const forLesson = assignments.filter(
      (x) => x.id === a.id && activeSectionIdSet.has(x.sectionId),
    );
    const progress = await fetchLessonProgressForStudentDefiner(
      a.id,
      studentId,
    );
    const status = progress?.status;

    rows.push({
      id: a.id,
      title: a.title,
      courseTitle: a.courseTitle,
      sectionNames: [
        ...new Set(
          forLesson.map((x) => x.sectionName).filter((n): n is string => Boolean(n)),
        ),
      ],
      flashcardCount: a.flashcardCount,
      progressStatus: status
        ? (status as 'STARTED' | 'COMPLETED')
        : 'open',
    });
  }

  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getStudentLessonDetail(
  studentId: string,
  lessonId: string,
) {
  const lesson = await assertStudentCanAccessLesson(studentId, lessonId);

  const cards = await fetchLessonFlashcardsDefiner(lessonId);
  const progress = await fetchLessonProgressForStudentDefiner(
    lessonId,
    studentId,
  );
  const chapterProgress = lesson.chapter
    ? await listChapterSectionProgressDefiner(lessonId, studentId)
    : [];

  const enrolledIds = await fetchActiveSectionIdsForStudentDefiner(studentId);
  const assignments = await fetchStudentLessonsForSectionsDefiner(enrolledIds);
  const match = assignments.find((a) => a.id === lessonId);

  return {
    id: lesson.id,
    title: lesson.title,
    markdown: lesson.markdown,
    chapter: lesson.chapter ?? null,
    courseTitle: match?.courseTitle ?? '',
    flashcards: cards.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      position: c.position,
    })),
    chapterProgress,
    progress: progress
      ? {
          status: progress.status as 'STARTED' | 'COMPLETED',
          completedAt: progress.completedAt,
        }
      : null,
  };
}
