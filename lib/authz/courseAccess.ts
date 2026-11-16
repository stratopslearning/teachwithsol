/**
 * Course / section level authorization built on authorize().
 *
 * Replaces users.role / professorId checks. `professorId` and professor_sections
 * remain metadata only — power comes from role_bindings (org → offering → section).
 */
import { ApiError } from '@/lib/api/errors';
import {
  authorize,
  listBindingsForUser,
  tenantIdForSection,
  type AuthzResource,
} from '@/lib/authz/authorize';
import { roleHasPermission, type Permission } from '@/lib/authz/permissions';
import {
  fetchCourseById,
  fetchOfferingIdsForCourse,
  fetchSectionById,
  fetchSectionRowsForCourse,
} from '@/lib/db/entityScopedReads';
import type { AuthUserRef } from '@/lib/getOrCreateUser';

export type AuthzUser = AuthUserRef;

export type CourseRef = {
  id: string;
  title: string;
  workspaceId: string | null;
};

/**
 * Authorize a permission on a course: org-level binding, any offering of the
 * course, or any section of the course. Platform staff need a support grant.
 */
export async function authorizeOnCourse(
  user: AuthzUser,
  permission: Permission,
  course: { id: string; workspaceId: string | null },
): Promise<boolean> {
  const tenantId = course.workspaceId;
  if (!tenantId) return false;

  const orgResource: AuthzResource = {
    tenantId,
    scopeType: 'organization',
    scopeId: tenantId,
  };
  if (await authorize(user, permission, orgResource)) return true;

  const offeringIds = await fetchOfferingIdsForCourse(course.id);
  for (const offeringId of offeringIds) {
    if (
      await authorize(user, permission, {
        tenantId,
        scopeType: 'offering',
        scopeId: offeringId,
      })
    ) {
      return true;
    }
  }

  const sectionRows = await fetchSectionRowsForCourse(course.id);
  for (const s of sectionRows) {
    if (
      await authorize(user, permission, {
        tenantId,
        scopeType: 'section',
        scopeId: s.id,
        offeringId: s.offeringId,
      })
    ) {
      return true;
    }
  }
  return false;
}

export async function assertCoursePermission(
  user: AuthzUser,
  permission: Permission,
  courseId: string,
): Promise<CourseRef> {
  const course = await fetchCourseById(courseId);
  if (!course) throw ApiError.notFound('Course not found');
  const ref = {
    id: course.id,
    title: course.title,
    workspaceId: course.workspaceId,
  };
  if (!(await authorizeOnCourse(user, permission, ref))) {
    throw ApiError.forbidden('You do not have access to this course');
  }
  return ref;
}

/** Authorize a permission on a section (inherits offering/org bindings). */
export async function authorizeOnSection(
  user: AuthzUser,
  permission: Permission,
  sectionId: string,
): Promise<boolean> {
  const section = await fetchSectionById(sectionId);
  if (!section || section.deletedAt) return false;
  const tenantId =
    section.tenantId ??
    section.workspaceId ??
    (await tenantIdForSection(sectionId));
  if (!tenantId) return false;
  return authorize(user, permission, {
    tenantId,
    scopeType: 'section',
    scopeId: sectionId,
    offeringId: section.offeringId,
  });
}

export async function assertSectionPermission(
  user: AuthzUser,
  permission: Permission,
  sectionId: string,
): Promise<void> {
  if (!(await authorizeOnSection(user, permission, sectionId))) {
    throw ApiError.forbidden('You do not have access to this section');
  }
}

/**
 * Course ids on which the user holds `permission` (via org/department, offering
 * or section bindings). Does NOT apply to platform staff (they use support grants).
 */
export async function listCourseIdsWithPermission(
  userId: string,
  permission: Permission,
): Promise<Set<string>> {
  const bindings = (await listBindingsForUser(userId)).filter((b) =>
    roleHasPermission(b.role, permission),
  );
  const out = new Set<string>();

  const {
    fetchCourseIdsForTenants,
    fetchOfferingCourseId,
    fetchSectionCourseId,
  } = await import('@/lib/workspace/workspaceScopedReads');

  const orgTenants = [
    ...new Set(
      bindings
        .filter(
          (b) =>
            b.scopeType === 'organization' || b.scopeType === 'department',
        )
        .map((b) => b.tenantId),
    ),
  ];
  if (orgTenants.length > 0) {
    const rows = await fetchCourseIdsForTenants(orgTenants);
    for (const c of rows) out.add(c.id);
  }

  for (const b of bindings) {
    if (b.scopeType === 'offering') {
      const courseId = await fetchOfferingCourseId(b.scopeId);
      if (courseId) out.add(courseId);
    } else if (b.scopeType === 'section') {
      const courseId = await fetchSectionCourseId(b.scopeId);
      if (courseId) out.add(courseId);
    }
  }
  return out;
}
