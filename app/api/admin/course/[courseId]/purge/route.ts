/**
 * Hard delete (purge) of a course. CASCADE wipes the section tree and
 * everything under it (attempts, assignments, quiz_sections, etc.).
 */
import { NextResponse } from 'next/server';

import { extractRequestMeta, logAudit } from '@/lib/audit';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { adminFetchCourseDefiner, adminPurgeCourseDefiner } from '@/lib/db/tenantWriteDefiners';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const DELETE = route<{ courseId: string }>(
  { auth: 'staff' },
  async ({ req: request, params, user }) => {
    const { courseId } = params;

    const targetCourse = await adminFetchCourseDefiner(courseId);
    if (!targetCourse) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const tenantId =
      (targetCourse.tenant_id as string | null) ??
      (targetCourse.workspace_id as string | null);
    if (!tenantId) {
      return NextResponse.json({ error: 'Course missing tenant' }, { status: 400 });
    }
    await requireSupportGrant(
      {
        id: user.id,
        clerkId: user.clerkId,
        platformStaff: user.platformStaff,
      },
      tenantId,
      { action: 'support.tenant_access', targetType: 'course', targetId: courseId },
    );

    await adminPurgeCourseDefiner(courseId);

    const meta = extractRequestMeta(request);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'admin.course.purge',
      targetType: 'course',
      targetId: courseId,
      metadata: { title: targetCourse.title, hard: true },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ success: true });
  },
);
