import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/db';
import { users } from '@/app/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';

import { loadAdminRecord } from '@/lib/admin/records';
import { apiErrorResponse } from '@/lib/api/errors';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { unassignQuizSectionDefiner } from '@/lib/db/facultyWriteDefiners';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string; sectionId: string }> }
) {
  try {
    const { quizId, sectionId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await db.query.users.findFirst({ where: eq(users.clerkId, userId) });
    if (!user || !user.platformStaff) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }
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
  } catch (error) {
    console.error('Error unassigning quiz from section:', error);
    return apiErrorResponse(error);
  }
}
