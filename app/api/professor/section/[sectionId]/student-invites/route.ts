import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { apiErrorResponse } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { authorize, tenantIdForSection } from '@/lib/authz';
import { createSectionStudentInvite } from '@/lib/authz/studentInvites';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { parseEmailListFromCsv } from '@/lib/csv/parseEmailList';
import { fetchCourseById, fetchSectionById } from '@/lib/db/entityScopedReads';
import { sendStudentInviteMail } from '@/lib/email';
import { getRequiredBaseUrl } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** One or more emails, newline/comma separated or CSV snippet. */
  emails: z.string().min(1).max(100_000),
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
      key: `student-invite:${user.id}`,
      limit: 20,
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

    const allowed = await authorize(user, 'roster.manage', {
      tenantId,
      scopeType: 'section',
      scopeId: sectionId,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'You cannot invite students to this section' },
        { status: 403 },
      );
    }

    // FORCE RLS: never read sections via db.query here.
    const section = await fetchSectionById(sectionId);
    if (!section || section.deletedAt) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }
    const course = await fetchCourseById(section.courseId);

    const parsed = bodySchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      return NextResponse.json({ error: 'emails required' }, { status: 400 });
    }

    const emails = parseEmailListFromCsv(parsed.data.emails);
    if (emails.length === 0) {
      return NextResponse.json({ error: 'No valid emails' }, { status: 400 });
    }
    if (emails.length > 200) {
      return NextResponse.json(
        { error: 'At most 200 emails per request' },
        { status: 400 },
      );
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
      invited?: boolean;
      claimUrl?: string;
      emailSent?: boolean;
      error?: string;
    }> = [];

    for (const email of emails) {
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
            emailResult.ok && !('skipped' in emailResult && emailResult.skipped),
        });
      } catch (err) {
        console.error('[student-invites] invite failed', email, err);
        results.push({
          email,
          ok: false,
          error: 'Invite failed',
        });
      }
    }

    const meta = extractRequestMeta(req);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'education.section.student_invite',
      targetType: 'section',
      targetId: sectionId,
      metadata: {
        invited: results.filter((r) => r.ok).length,
        total: results.length,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({
      success: true,
      invited: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
