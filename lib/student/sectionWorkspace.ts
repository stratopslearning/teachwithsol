import { fetchCourseById, fetchSectionById } from '@/lib/db/entityScopedReads';
import { isCreatorWorkspaceUnverified } from '@/lib/onboarding/workspaceSettings';
import { getWorkspace } from '@/lib/workspace/access';

export async function isStudentSectionInUnverifiedCreatorWorkspace(
  sectionId: string,
): Promise<boolean> {
  // FORCE RLS: bare sections/courses joins hide cross-tenant rows.
  const section = await fetchSectionById(sectionId);
  if (!section) return false;
  const course = await fetchCourseById(section.courseId);
  const workspaceId = course?.workspaceId ?? section.workspaceId;
  if (!workspaceId) return false;
  const workspace = await getWorkspace(workspaceId);
  return isCreatorWorkspaceUnverified(workspace ?? null);
}
