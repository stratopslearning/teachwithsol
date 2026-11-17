import { NextResponse } from 'next/server';

import { loadAdminRecord } from '@/lib/admin/records';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { unassignQuizSectionDefiner } from '@/lib/db/facultyWriteDefiners';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const DELETE = route<{ quizId: string; sectionId: string }>(
  { auth: 'staff' },
  async ({ params, user }) => {
    const { quizId, sectionId } = params;
    // FORCE RLS: a plain db read finds no quiz; load it via the definer.
    const quiz = await loadAdminRecord('quiz', quizId);
    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }
    if (!quiz.tenantId) {
      return NextResponse.json({ error: 'Quiz missing tenant' }, { status: 400 });
    }
    await requireSupportGrant(
      {
        id: user.id,
        clerkId: user.clerkId,
        platformStaff: user.platformStaff,
      },
      quiz.tenantId,
      { action: 'support.tenant_access', targetType: 'quiz', targetId: quizId },
    );
    await unassignQuizSectionDefiner(sectionId, quizId);
    return NextResponse.json({ success: true });
  },
);
