import { and, eq, isNull } from 'drizzle-orm';

import { courseMaterials, courses } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import {
  assertCoursePermission,
  authorizeOnCourse,
  listCourseIdsWithPermission,
  type AuthzUser,
} from '@/lib/authz/courseAccess';

type AuthUser = AuthzUser;

export type TeachableCourse = {
  id: string;
  title: string;
  sectionCount: number;
};

/**
 * Courses the user may manage knowledge for: `knowledge.manage` via org /
 * department / offering / section role bindings. Membership seats and
 * professor_sections carry no power. Platform staff see only tenants with an
 * active support grant.
 */
export async function listTeachableCourses(
  user: AuthUser,
): Promise<TeachableCourse[]> {
  let courseIds: Set<string>;

  if (user.platformStaff) {
    // FORCE RLS: plain db reads of grants/courses return nothing. Check each
    // workspace with the SECURITY DEFINER grant lookup, then read its courses
    // under that workspace.
    const { listAllTenantIds } = await import('@/lib/db/allTenants');
    const { hasActiveSupportAccess } = await import('@/lib/authz/supportAccess');
    const { withTenant } = await import('@/lib/db/tenantContext');
    const tenantIds: string[] = [];
    for (const tenantId of await listAllTenantIds()) {
      if (await hasActiveSupportAccess(user.id, tenantId)) tenantIds.push(tenantId);
    }
    if (tenantIds.length === 0) return [];
    const rows = (
      await Promise.all(
        tenantIds.map((tenantId) =>
          withTenant(tenantId, user.id, (tx) =>
            tx.query.courses.findMany({
              where: and(
                eq(courses.workspaceId, tenantId),
                isNull(courses.deletedAt),
              ),
              columns: { id: true },
            }),
          ),
        ),
      )
    ).flat();
    courseIds = new Set(rows.map((c) => c.id));
  } else {
    courseIds = await listCourseIdsWithPermission(user.id, 'knowledge.manage');
  }

  if (courseIds.size === 0) return [];

  const { fetchCoursesByIds } = await import(
    '@/lib/workspace/workspaceScopedReads'
  );
  return fetchCoursesByIds([...courseIds]);
}

export async function assertCanManageCourse(
  user: AuthUser,
  courseId: string,
): Promise<{ id: string; title: string; workspaceId: string | null }> {
  const course = await assertCoursePermission(
    user,
    'knowledge.manage',
    courseId,
  );
  return {
    id: course.id,
    title: course.title,
    workspaceId: course.workspaceId,
  };
}

export async function assertCanManageMaterial(
  user: AuthUser,
  materialId: string,
) {
  const { fetchCourseMaterialByIdDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  const material = await fetchCourseMaterialByIdDefiner(materialId);
  if (!material || material.deletedAt) {
    throw ApiError.notFound('Material not found');
  }
  await assertCanManageCourse(user, material.courseId);
  return material as unknown as typeof courseMaterials.$inferSelect;
}

/**
 * True when the user holds `knowledge.manage` at ORGANIZATION scope for the
 * course's tenant (owner/admin bindings) — not merely a course-level lead.
 */
export async function isWorkspaceFacultyForCourse(
  userId: string,
  courseId: string,
): Promise<boolean> {
  // FORCE RLS: a plain db read finds no course; the definer skips deleted ones.
  const { fetchCourseById } = await import('@/lib/db/entityScopedReads');
  const course = await fetchCourseById(courseId);
  if (!course?.workspaceId) return false;
  const { authorize } = await import('@/lib/authz/authorize');
  return authorize({ id: userId }, 'knowledge.manage', {
    tenantId: course.workspaceId,
    scopeType: 'organization',
    scopeId: course.workspaceId,
  });
}

export { authorizeOnCourse };
