import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/app/db';
import { users } from '@/app/db/schema';
import { apiErrorResponse } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { authorize, tenantIdForSection } from '@/lib/authz';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { assertTeachesSection } from '@/lib/professor/sections';
import { createSectionStudentInvite } from '@/lib/authz/studentInvites';
import { parseEmailListFromCsv } from '@/lib/csv/parseEmailList';
import { fetchCourseById, fetchSectionById } from '@/lib/db/entityScopedReads';
import { upsertStudentEnrollment } from '@/lib/enrollment/sources';
import { sendStudentInviteMail } from '@/lib/email';
import { getRequiredBaseUrl } from '@/lib/stripe';
import {
  assertSeatAvailable,
  ensureWorkspaceMembership,
  getCourseWorkspaceId,
} from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  csv: z.string().min(1).max(500_000),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sectionId: string }> },
) {
  try {
    const { sectionId } = await context.params;
    const auth = await requireProfessorApi(req, { scope: 'sections:write' });
    const user = auth.user;

    const limited = await enforceRateLimit({
      key: `roster-import:${user.id}`,
      limit: 10,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const tenantId = await tenantIdForSection(sectionId);
    if (!tenantId) {
      return NextResponse.json({ error: 'Section tenant not found' }, { status: 404 });
    }

    const { requireWorkspaceTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireWorkspaceTeaching(tenantId, user);

    try {
      await assertTeachesSection(user, sectionId);
    } catch {
      const canManage = await authorize(user, 'manage', {
        tenantId,
        scopeType: 'section',
        scopeId: sectionId,
      });
      if (!canManage) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // FORCE RLS: never read sections via db.query here.
    const section = await fetchSectionById(sectionId);
    if (!section || section.deletedAt) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }
    const course = await fetchCourseById(section.courseId);

    const parsed = bodySchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid CSV body' }, { status: 400 });
    }

    const emails = parseEmailListFromCsv(parsed.data.csv);
    if (emails.length === 0) {
      return NextResponse.json({ error: 'No valid emails in CSV' }, { status: 400 });
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

    let baseUrl: string | undefined;
    try {
      baseUrl = getRequiredBaseUrl();
    } catch {
      baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
    }

    const results: Array<{
      email: string;
      ok: boolean;
      error?: string;
      invited?: boolean;
      claimUrl?: string;
      emailSent?: boolean;
    }> = [];

    for (const email of emails) {
      const student = await db.query.users.findFirst({
        where: sql`lower(${users.email}) = ${email}`,
      });
      if (!student) {
        try {
          const invite = await createSectionStudentInvite({
            tenantId,
            sectionId,
            email,
            invitedBy: user.id,
            baseUrl,
          });
          const emailResult = await sendStudentInviteMail({
            workspaceId: tenantId,
            to: email,
            sectionName: section.name,
            courseTitle: course?.title ?? null,
            claimUrl: invite.claimUrl,
            enrollmentCode: section.studentEnrollmentCode,
            expiresAt: invite.expiresAt,
          });
          results.push({
            email,
            ok: true,
            invited: true,
            claimUrl: invite.claimUrl,
            emailSent:
              emailResult.ok &&
              !('skipped' in emailResult && emailResult.skipped),
          });
        } catch (err) {
          results.push({
            email,
            ok: false,
            error: err instanceof Error ? err.message : 'Invite failed',
          });
        }
        continue;
      }
      try {
        await upsertStudentEnrollment({
          studentId: student.id,
          sectionId,
          source: 'csv',
          tenantId,
        });
        if (workspaceId) {
          await ensureWorkspaceMembership({
            workspaceId,
            userId: student.id,
            role: 'learner',
          });
        }
        results.push({ email, ok: true });
      } catch (err) {
        results.push({
          email,
          ok: false,
          error: err instanceof Error ? err.message : 'Enroll failed',
        });
      }
    }

    const meta = extractRequestMeta(req);
    const enrolled = results.filter((r) => r.ok && !r.invited).length;
    const invited = results.filter((r) => r.ok && r.invited).length;
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'education.roster.import_csv',
      targetType: 'section',
      targetId: sectionId,
      metadata: {
        enrolled,
        invited,
        total: results.length,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({
      success: true,
      enrolled,
      invited,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
