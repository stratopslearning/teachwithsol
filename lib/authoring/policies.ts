import { ApiError } from '@/lib/api/errors';
import { fetchCourseById } from '@/lib/db/entityScopedReads';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import {
  assertWorkspaceFaculty,
  assertWorkspaceFacultyRead,
} from '@/lib/knowledge/workspaceAccess';
import type { AuthUser } from '@/lib/getOrCreateUser';

export type AuthoringPolicy = {
  id: string;
  workspaceId: string;
  structureNotes: string | null;
  rubricStyle: string | null;
  tone: string | null;
  extraPrompt: string | null;
  updatedAt: Date;
};

async function readAuthoringPolicyForWorkspace(
  workspaceId: string,
): Promise<AuthoringPolicy | null> {
  const { getAuthoringPolicyDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  return getAuthoringPolicyDefiner(workspaceId);
}

/** Trusted internal read after course-scoped authz (propose/switchUp/etc.). */
export async function getAuthoringPolicyForCourse(
  courseId: string,
): Promise<AuthoringPolicy | null> {
  const course = await fetchCourseById(courseId);
  const workspaceId = course?.workspaceId ?? course?.tenantId;
  if (!workspaceId) return null;
  return readAuthoringPolicyForWorkspace(workspaceId);
}

export async function getAuthoringPolicyForWorkspace(
  user: AuthUser,
  workspaceId: string,
): Promise<AuthoringPolicy | null> {
  await assertWorkspaceFacultyRead(user, workspaceId);
  return readAuthoringPolicyForWorkspace(workspaceId);
}

export async function upsertAuthoringPolicy(
  user: AuthUser,
  workspaceId: string,
  input: {
    structureNotes?: string | null;
    rubricStyle?: string | null;
    tone?: string | null;
    extraPrompt?: string | null;
  },
): Promise<AuthoringPolicy> {
  await assertWorkspaceFaculty(user, workspaceId);
  const { upsertAuthoringPolicyDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  return upsertAuthoringPolicyDefiner({
    workspaceId,
    structureNotes: input.structureNotes ?? null,
    rubricStyle: input.rubricStyle ?? null,
    tone: input.tone ?? null,
    extraPrompt: input.extraPrompt ?? null,
  });
}

export async function getAuthoringPolicyForManagedCourse(
  user: AuthUser,
  courseId: string,
): Promise<AuthoringPolicy | null> {
  await assertCanManageCourse(user, courseId);
  const course = await fetchCourseById(courseId);
  const workspaceId = course?.workspaceId ?? course?.tenantId;
  if (!workspaceId) return null;
  return readAuthoringPolicyForWorkspace(workspaceId);
}

export async function requireWorkspaceIdForCourse(
  courseId: string,
): Promise<string> {
  const course = await fetchCourseById(courseId);
  const workspaceId = course?.workspaceId ?? course?.tenantId;
  if (!workspaceId) throw ApiError.badRequest('Course has no workspace');
  return workspaceId;
}
