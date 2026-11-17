/**
 * Hard delete (purge) of a quiz under FORCE RLS via SECURITY DEFINER.
 */
import { NextResponse } from 'next/server';

import { extractRequestMeta, logAudit } from '@/lib/audit';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { adminFetchQuizDefiner, adminPurgeQuizDefiner } from '@/lib/db/tenantWriteDefiners';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const DELETE = route<{ quizId: string }>(
  { auth: 'staff' },
  async ({ req: request, params, user }) => {
    const { quizId } = params;

    const targetQuiz = await adminFetchQuizDefiner(quizId);
    if (!targetQuiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }
    const tenantId = targetQuiz.tenant_id as string | null;
    if (!tenantId) {
      return NextResponse.json({ error: 'Quiz missing tenant' }, { status: 400 });
    }
    await requireSupportGrant(
      {
        id: user.id,
        clerkId: user.clerkId,
        platformStaff: user.platformStaff,
      },
      tenantId,
      { action: 'support.tenant_access', targetType: 'quiz', targetId: quizId },
    );

    await adminPurgeQuizDefiner(quizId);

    const meta = extractRequestMeta(request);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'admin.quiz.purge',
      targetType: 'quiz',
      targetId: quizId,
      metadata: { title: targetQuiz.title, hard: true },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ success: true });
  },
);
