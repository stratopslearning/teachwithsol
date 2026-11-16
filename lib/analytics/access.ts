import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import { ApiError } from '@/lib/api/errors';
import type { AuthUser } from '@/lib/getOrCreateUser';

export async function resolveAnalyticsSectionIds(
  user: AuthUser,
  courseId: string,
  sectionId?: string | null,
): Promise<{ course: { id: string; title: string }; sectionIds: string[] }> {
  const course = await assertCanManageCourse(user, courseId);
  const teachable = await listTeachableSectionIdsForCourse(user, courseId);
  if (teachable.length === 0) {
    return { course, sectionIds: [] };
  }

  if (sectionId) {
    if (!teachable.includes(sectionId)) {
      throw ApiError.forbidden('You do not teach that section');
    }
    return { course, sectionIds: [sectionId] };
  }

  return { course, sectionIds: teachable };
}
