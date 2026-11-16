import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db } from '@/app/db';
import { users } from '@/app/db/schema';
import { loadAdminRecord } from '@/lib/admin/records';
import { apiErrorResponse } from '@/lib/api/errors';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { updateQuizDefiner } from '@/lib/db/entityScopedReads';
import { quizUpdateSchema } from '@/lib/quizSchemas';
import {
  buildQuizDescriptionWithMetadata,
  extractQuizMetadata,
} from '@/lib/utils';
import { readJsonBody } from '@/lib/api/readJsonBody';

export const dynamic = 'force-dynamic';

const adminQuizUpdateSchema = quizUpdateSchema;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> },
) {
  try {
    const { quizId } = await params;
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

    // FORCE RLS: a plain db read finds no quiz; load it via the definer.
    const existingQuiz = await loadAdminRecord('quiz', quizId);
    if (!existingQuiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }
    if (!existingQuiz.tenantId) {
      return NextResponse.json({ error: 'Quiz missing tenant' }, { status: 400 });
    }
    await requireSupportGrant(
      {
        id: user.id,
        clerkId: user.clerkId,
        platformStaff: user.platformStaff,
      },
      existingQuiz.tenantId,
      { action: 'support.tenant_access', targetType: 'quiz', targetId: quizId },
    );

    const body = await readJsonBody(request);
    const parsed = adminQuizUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.errors },
        { status: 400 },
      );
    }
    const data = parsed.data;
    const hideFeedbackAfterDue = extractQuizMetadata(
      data.description,
    ).hideFeedbackAfterDue;
    const normalizedDescription = buildQuizDescriptionWithMetadata(
      data.description,
      hideFeedbackAfterDue,
    );

    await updateQuizDefiner({
      quizId,
      title: data.title,
      description: normalizedDescription || null,
      maxAttempts: data.maxAttempts,
      timeLimit: data.timeLimit ?? null,
      passingScore: data.passingScore,
      startDate: new Date(data.startDate).toISOString(),
      endDate: new Date(data.endDate).toISOString(),
      isActive: data.isActive,
      assignedBy: user.id,
      sectionIds: data.sectionIds,
      questions: data.questions.map((q, index) => ({
        id: q.id,
        type: q.type,
        question: q.question,
        options: q.options ?? null,
        correctAnswer: q.correctAnswer ?? null,
        points: q.points,
        order: q.order ?? index,
      })),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating quiz:', error);
    return apiErrorResponse(error);
  }
}
