import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/app/db';
import { courseOfferings } from '@/app/db/schema';
import {
  isOfferingEnded,
  OFFERING_ENDED_MESSAGE,
} from '@/lib/offerings/lifecycle';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { paymentsEnabled } from '@/lib/featureFlags';
import { userMayUsePreEnrollStudentApi } from '@/lib/authz';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { isSectionConcluded } from '@/lib/sectionAvailability';
import {
  findSectionByStudentCode,
  findSectionByStudentCodeGloballyUnique,
} from '@/lib/sections/enrollmentLookup';
import { upsertStudentEnrollment } from '@/lib/enrollment/sources';
import {
  assertSeatAvailable,
  ensureWorkspaceMembership,
  getCourseWorkspaceId,
  resolveStudentEnrollWorkspaceId,
} from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await userMayUsePreEnrollStudentApi(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Brute-force enrollment-code attempts (e.g. trying to guess a valid
    // section code) are throttled per user.
    const limited = await enforceRateLimit({
      key: `enroll-student:${user.id}`,
      limit: 10,
      windowMs: 60_000,
      prefix: 'rl',
      message: 'Too many enrollment attempts. Please wait a moment.',
    });
    if (limited) return limited;

    // Match the same paywall the dashboard middleware applies to student RSCs:
    // unpaid students should be redirected to /payment, not silently allowed
    // to enroll in sections they can never use.
    //
    // Skipped entirely when the payments feature flag is off.
    if (paymentsEnabled() && !user.paid) {
      return NextResponse.json(
        {
          error: 'Payment required before enrolling in sections.',
          paymentRequired: true,
        },
        { status: 402 },
      );
    }

    const body = (await readJsonBody(req)) as {
      enrollmentCode?: unknown;
      workspaceId?: unknown;
    };
    const { enrollmentCode } = body;
    if (!enrollmentCode || typeof enrollmentCode !== 'string') {
      return NextResponse.json(
        { error: 'Enrollment code is required' },
        { status: 400 },
      );
    }

    const workspaceScope = await resolveStudentEnrollWorkspaceId(
      user.id,
      typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
    );
    if (!workspaceScope.ok) {
      return NextResponse.json(
        { error: workspaceScope.error },
        { status: workspaceScope.status },
      );
    }

    let section: Awaited<ReturnType<typeof findSectionByStudentCode>>;
    if (workspaceScope.workspaceId) {
      section = await findSectionByStudentCode(
        workspaceScope.workspaceId,
        enrollmentCode,
      );
    } else if (workspaceScope.requireGlobalUnique) {
      const hit = await findSectionByStudentCodeGloballyUnique(enrollmentCode);
      section = hit?.section;
    }

    if (!section) {
      const needsWorkspace =
        workspaceScope.requireGlobalUnique && !workspaceScope.workspaceId;
      return NextResponse.json(
        {
          error: needsWorkspace
            ? 'Invalid enrollment code or workspaceId is required when the same code exists in multiple workspaces.'
            : 'Invalid enrollment code',
        },
        { status: 404 },
      );
    }

    // Refuse to enroll into archived / concluded sections.
    if (!section.isActive) {
      return NextResponse.json(
        { error: 'This section is no longer active.' },
        { status: 400 },
      );
    }
    if (isSectionConcluded(section)) {
      return NextResponse.json(
        { error: 'This section has ended. Enrollment is closed.' },
        { status: 400 },
      );
    }

    // Wave 3 (23): ended / archived offerings accept no new enrollments.
    if (section.offeringId) {
      const offering = await db.query.courseOfferings.findFirst({
        where: eq(courseOfferings.id, section.offeringId),
        columns: { status: true, endsAt: true },
      });
      if (isOfferingEnded(offering)) {
        return NextResponse.json(
          { error: OFFERING_ENDED_MESSAGE },
          { status: 409 },
        );
      }
    }

    const tenantId =
      section.tenantId ??
      section.workspaceId ??
      (await getCourseWorkspaceId(section.courseId));
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Section tenant could not be resolved' },
        { status: 500 },
      );
    }

    try {
      const { requireWorkspaceTeaching } = await import(
        '@/lib/workspace/entitlement'
      );
      await requireWorkspaceTeaching(tenantId);
    } catch (error) {
      const { apiErrorResponse } = await import('@/lib/api/errors');
      return apiErrorResponse(error);
    }

    const workspaceId = await getCourseWorkspaceId(section.courseId);
    if (workspaceId) {
      const seats = await assertSeatAvailable(workspaceId);
      if (!seats.ok) {
        return NextResponse.json(
          { error: seats.reason, seatCap: seats.cap, seatsUsed: seats.used },
          { status: 403 },
        );
      }
    }

    let enrollResult;
    try {
      enrollResult = await upsertStudentEnrollment({
        studentId: user.id,
        sectionId: section.id,
        source: 'code',
        tenantId,
        refuseCourseConflict: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('COURSE_SECTION_CONFLICT')) {
        return NextResponse.json(
          {
            error:
              'You are already enrolled in a section from this course. You cannot enroll in multiple sections from the same course.',
          },
          { status: 400 },
        );
      }
      throw error;
    }

    if (workspaceId) {
      await ensureWorkspaceMembership({
        workspaceId,
        userId: user.id,
        role: 'learner',
      });
    }

    const meta = extractRequestMeta(req);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'education.enrollment.join',
      targetType: 'section',
      targetId: section.id,
      metadata: { courseId: section.courseId },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    // Bare courses SELECT flakes under FORCE RLS — use entity DEFINER.
    const { fetchCourseById } = await import('@/lib/db/entityScopedReads');
    const course = await fetchCourseById(section.courseId);

    return NextResponse.json({
      success: true,
      message: enrollResult.created
        ? 'Successfully enrolled in section'
        : 'Enrollment updated for this section',
      section: {
        id: section.id,
        name: section.name,
        course: course
          ? {
              id: course.id,
              title: course.title,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Section not found')) {
      return NextResponse.json(
        { error: 'Section not found. Try the code again or ask your professor.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: 'Failed to enroll' }, { status: 500 });
  }
}
