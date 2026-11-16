import { ApiError } from '@/lib/api/errors';
import { authorize, tenantIdForSection } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import type { AuthUser } from '@/lib/getOrCreateUser';

/** Soft-drop a student from a section (status DROPPED). Does not delete the user. */
export async function dropStudentFromSection(
  user: AuthUser,
  opts: { sectionId: string; enrollmentId: string },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const tenantId = await tenantIdForSection(opts.sectionId);
  if (!tenantId) throw ApiError.notFound('Section not found');
  const { requireWorkspaceTeaching } = await import(
    '@/lib/workspace/entitlement'
  );
  await requireWorkspaceTeaching(tenantId, user);
  const allowed = await authorize(user, 'roster.manage', {
    tenantId,
    scopeType: 'section',
    scopeId: opts.sectionId,
  });
  if (!allowed) {
    throw ApiError.forbidden('You cannot manage the roster for this section');
  }

  const { dropStudentEnrollmentDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  let dropped: Awaited<ReturnType<typeof dropStudentEnrollmentDefiner>>;
  try {
    dropped = await dropStudentEnrollmentDefiner(opts.enrollmentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Enrollment not found')) {
      throw ApiError.notFound('Enrollment not found');
    }
    if (message.includes('ALREADY_DROPPED')) {
      throw ApiError.badRequest('Student is already dropped from this section');
    }
    throw err;
  }
  if (dropped.sectionId !== opts.sectionId) {
    throw ApiError.notFound('Enrollment not found');
  }

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'education.student_enrollment.drop',
    targetType: 'section',
    targetId: opts.sectionId,
    metadata: {
      enrollmentId: dropped.id,
      studentId: dropped.studentId,
    },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });
}
