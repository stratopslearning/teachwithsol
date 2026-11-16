import { ApiError } from '@/lib/api/errors';
import { fetchActiveSectionIdsForStudentDefiner } from '@/lib/db/bookWriteDefiners';
import {
  fetchLessonByIdDefiner,
  fetchLessonSectionIdsDefiner,
} from '@/lib/db/studentReadDefiners';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';

export async function assertCanManageLesson(user: AuthUser, lessonId: string) {
  const lesson = await fetchLessonByIdDefiner(lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await assertCanManageCourse(user, lesson.courseId);
  return lesson;
}

/** Student may access an active lesson assigned to one of their active sections. */
export async function assertStudentCanAccessLesson(
  studentId: string,
  lessonId: string,
) {
  const lesson = await fetchLessonByIdDefiner(lessonId);
  if (!lesson || !lesson.isActive) {
    throw ApiError.notFound('Lesson not found');
  }

  const sectionIds = await fetchLessonSectionIdsDefiner(lessonId);
  if (sectionIds.length === 0) throw ApiError.forbidden('Lesson not assigned');

  const enrolled = await fetchActiveSectionIdsForStudentDefiner(studentId);
  const enrolledSet = new Set(enrolled);
  const ok = sectionIds.some((id) => enrolledSet.has(id));
  if (!ok) throw ApiError.forbidden('You are not enrolled in this lesson');

  return lesson;
}
