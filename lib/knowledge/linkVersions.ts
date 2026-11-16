import { ApiError } from '@/lib/api/errors';
import type { AuthUser } from '@/lib/getOrCreateUser';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import { getCourseWorkspaceId } from '@/lib/workspace';

/**
 * When a library document advances currentVersionId, mark attached courses
 * that are still on an older pin so faculty can opt in.
 */
export async function notifyLinkedCoursesOfNewVersion(
  documentId: string,
  newVersionId: string,
): Promise<void> {
  const { notifyCourseKnowledgeVersionDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  await notifyCourseKnowledgeVersionDefiner(documentId, newVersionId);
}

/** Advance the course pin to the offered update version. */
export async function acceptLinkedDocumentUpdate(
  user: AuthUser,
  courseId: string,
  documentId: string,
): Promise<void> {
  await assertCanManageCourse(user, courseId);
  const workspaceId = await getCourseWorkspaceId(courseId);
  if (!workspaceId) throw ApiError.badRequest('Course has no workspace');

  const { acceptCourseKnowledgeUpdateDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  try {
    await acceptCourseKnowledgeUpdateDefiner({
      courseId,
      documentId,
      tenantId: workspaceId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not attached')) {
      throw ApiError.notFound('Document is not attached to this course');
    }
    if (message.includes('No update available')) {
      throw ApiError.badRequest('No update available for this attachment');
    }
    throw err;
  }
}

/** Keep the current pin; clear the update notice. */
export async function dismissLinkedDocumentUpdate(
  user: AuthUser,
  courseId: string,
  documentId: string,
): Promise<void> {
  await assertCanManageCourse(user, courseId);
  const workspaceId = await getCourseWorkspaceId(courseId);
  if (!workspaceId) throw ApiError.badRequest('Course has no workspace');

  const { dismissCourseKnowledgeUpdateDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  const updated = await dismissCourseKnowledgeUpdateDefiner({
    courseId,
    documentId,
    tenantId: workspaceId,
  });
  if (updated === 0) {
    throw ApiError.notFound('No pending update for this attachment');
  }
}
