import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';

import { db } from '@/app/db';
import { courses, sections, users } from '@/app/db/schema';
import { loadAdminRecord } from '@/lib/admin/records';
import { withTenant } from '@/lib/db/tenantContext';
import { apiErrorResponse } from '@/lib/api/errors';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';

export const dynamic = 'force-dynamic';

/**
 * Soft delete a course. Active sections under it are also marked deleted in
 * the same transaction so the entire course tree disappears from listings
 * atomically. Hard delete is at /api/admin/course/[courseId]/purge.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
    });
    if (!user || !user.platformStaff) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 },
      );
    }
    const { courseId } = await params;

    // FORCE RLS: a plain db read finds no course; load it via the definer.
    const targetCourse = await loadAdminRecord('course', courseId);
    if (!targetCourse) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    const tenantId = targetCourse.tenantId;
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
    if (targetCourse.deletedAt) {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }

    const cascadedSectionIds: string[] = [];
    // Under the course's tenant: plain db writes match no rows under FORCE RLS.
    await withTenant(tenantId, user.id, async (tx) => {
      const now = new Date();
      const liveSections = await tx.query.sections.findMany({
        where: and(eq(sections.courseId, courseId), isNull(sections.deletedAt)),
      });
      for (const section of liveSections) cascadedSectionIds.push(section.id);
      if (liveSections.length > 0) {
        await tx
          .update(sections)
          .set({ deletedAt: now, isActive: false })
          .where(and(eq(sections.courseId, courseId), isNull(sections.deletedAt)));
      }
      await tx
        .update(courses)
        .set({ deletedAt: now, isActive: false })
        .where(eq(courses.id, courseId));
    });

    const meta = extractRequestMeta(req);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'admin.course.delete',
      targetType: 'course',
      targetId: courseId,
      metadata: {
        title: targetCourse.label,
        cascadedSections: cascadedSectionIds,
        soft: true,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting course:', error);
    return apiErrorResponse(error);
  }
}
