import { NextResponse } from 'next/server';

import { loadAdminRecord } from '@/lib/admin/records';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { updateQuizDefiner } from '@/lib/db/entityScopedReads';
import { quizUpdateSchema } from '@/lib/quizSchemas';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const adminQuizUpdateSchema = quizUpdateSchema;

export const PUT = route<{ quizId: string }>(
  { auth: 'staff' },
  async ({ req: request, params, user }) => {
    const { quizId } = params;

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

    await updateQuizDefiner({
      quizId,
      title: data.title,
      description: data.description || null,
      maxAttempts: data.maxAttempts,
      timeLimit: data.timeLimit ?? null,
      passingScore: data.passingScore,
      startDate: new Date(data.startDate).toISOString(),
      endDate: new Date(data.endDate).toISOString(),
      isActive: data.isActive,
      hideFeedbackAfterDue: data.hideFeedbackAfterDue,
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
  },
);
