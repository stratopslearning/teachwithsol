import { ApiError } from '@/lib/api/errors';
import {
  createSectionDefiner,
  fetchCourseById,
} from '@/lib/db/entityScopedReads';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';
import { adminSupportForTenant } from '@/lib/professor/adminSupport';
import { parseOptionalEndsAt } from '@/lib/sectionAvailability';
import { generateEnrollmentCode } from '@/lib/utils';
import {
  assertWorkspaceAllowsCourseCreate,
  userCanCreateCoursesInWorkspace,
} from '@/lib/workspace';

export type CreatedSection = {
  id: string;
  name: string;
  courseId: string;
  professorEnrollmentCode: string;
  studentEnrollmentCode: string;
  endsAt: Date | null;
  createdAt: Date;
};

/**
 * Create a section for a workspace course and enroll the creator as teaching faculty.
 * AuthZ in app code; insert via SECURITY DEFINER (FORCE RLS / Neon GUC flakes).
 */
export async function createSectionForCourse(
  user: AuthUser,
  opts: {
    courseId: string;
    name: string;
    endsAt?: string | null;
  },
): Promise<CreatedSection> {
  const name = opts.name.trim();
  if (!name || name.length > 100) {
    throw ApiError.badRequest('Section name is required (max 100 characters)');
  }

  const course = await fetchCourseById(opts.courseId);
  if (!course) throw ApiError.notFound('Course not found');
  if (!course.workspaceId) {
    throw ApiError.badRequest('Course has no workspace');
  }

  if (user.platformStaff) {
    if (!(await adminSupportForTenant(user, course.workspaceId))) {
      throw ApiError.forbidden('Support grant required for this workspace');
    }
  } else {
    const allowed = await userCanCreateCoursesInWorkspace(
      user.id,
      course.workspaceId,
    );
    if (!allowed) {
      throw ApiError.forbidden(
        'Not allowed to create sections in this workspace',
      );
    }
    const entitlement = await assertWorkspaceAllowsCourseCreate(
      course.workspaceId,
    );
    if (!entitlement.ok) {
      if (entitlement.code === 'billing_required') {
        throw ApiError.paymentRequired(entitlement.reason);
      }
      throw ApiError.forbidden(entitlement.reason);
    }
  }

  const endsAtResult = parseOptionalEndsAt(opts.endsAt ?? null);
  if (!endsAtResult.ok) {
    throw ApiError.badRequest(endsAtResult.error);
  }

  const professorEnrollmentCode = generateEnrollmentCode();
  const studentEnrollmentCode = generateEnrollmentCode();

  return createSectionDefiner({
    courseId: course.id,
    name,
    professorEnrollmentCode,
    studentEnrollmentCode,
    createdByUserId: user.platformStaff ? null : user.id,
    endsAt: endsAtResult.endsAt?.toISOString() ?? null,
    bindCreator: !user.platformStaff,
  });
}
