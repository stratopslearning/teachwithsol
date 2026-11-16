import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { attempts, assignments, quizzes } from '@/app/db/schema';
import {
  professorCanAccessQuiz,
  redactAttemptFeedbackForViewer,
} from '@/lib/quizAccess';
import { isStudentEntitled } from '@/lib/featureFlags';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { shouldHideFeedbackForStudent } from '@/lib/utils';
import { fetchQuizById } from '@/lib/db/entityScopedReads';
import { withTenant } from '@/lib/db/tenantContext';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ quizId: string }> },
) {
  try {
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isStudentEntitled(user)) {
      return NextResponse.json({ error: 'Payment required' }, { status: 402 });
    }

    const params = await context.params;
    const quizId = params.quizId;
    const { searchParams } = new URL(req.url);
    const assignmentId = searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    // FORCE RLS: plain db reads return nothing here (students always saw
    // "Assignment not found"). Resolve the quiz's tenant via the definer and
    // read under it.
    const quizMeta = await fetchQuizById(quizId);
    const tenantId = quizMeta?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const assignment = await withTenant(tenantId, user.id, (tx) =>
      tx.query.assignments.findFirst({
        where: and(
          eq(assignments.id, assignmentId),
          eq(assignments.quizId, quizId),
        ),
      }),
    );
    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const isOwner = assignment.studentId === user.id;
    if (!isOwner) {
      // Binding-based (incl. platform staff via support grant inside authorize()).
      const allowed = await professorCanAccessQuiz(user, quizId);
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { allAttempts, quiz } = await withTenant(tenantId, user.id, async (tx) => ({
      allAttempts: await tx.query.attempts.findMany({
        where: and(
          eq(attempts.assignmentId, assignmentId),
          eq(attempts.quizId, quizId),
        ),
        orderBy: (attempts, { desc }) => [desc(attempts.submittedAt)],
      }),
      quiz: await tx.query.quizzes.findFirst({
        where: eq(quizzes.id, quizId),
      }),
    }));

    const submittedAttempts = allAttempts.filter((a) => a.submittedAt != null);

    const maxAttempts = quiz?.maxAttempts || 1;

    if (submittedAttempts.length === 0) {
      return NextResponse.json({
        attempts: [],
        bestScore: 0,
        bestPercentage: 0,
        totalAttempts: 0,
        maxAttempts,
        attemptsRemaining: maxAttempts,
        inProgress: allAttempts.some((a) => a.submittedAt == null),
      });
    }

    const quizForHide = quiz
      ? { endDate: quiz.endDate, description: quiz.description }
      : { endDate: null, description: null };
    const hideFeedback =
      isOwner && shouldHideFeedbackForStudent(quizForHide, 'STUDENT');

    const bestScoreRaw = Math.max(...submittedAttempts.map((a) => a.score || 0));
    const candidateMaxScore =
      submittedAttempts.find((a) => a.maxScore)?.maxScore || 0;
    const bestPercentageRaw =
      candidateMaxScore > 0
        ? Math.round((bestScoreRaw / candidateMaxScore) * 100)
        : 0;

    const formattedAttempts = submittedAttempts.map((attempt, index) => {
      const base = {
        id: attempt.id,
        score: attempt.score,
        maxScore: attempt.maxScore,
        percentage: attempt.percentage,
        submittedAt: attempt.submittedAt,
        attemptNumber: submittedAttempts.length - index,
        gptFeedback: attempt.gptFeedback,
      };
      return hideFeedback
        ? redactAttemptFeedbackForViewer(base, quizForHide, 'STUDENT')
        : base;
    });

    return NextResponse.json({
      attempts: formattedAttempts,
      bestScore: hideFeedback ? 0 : bestScoreRaw,
      bestPercentage: hideFeedback ? 0 : bestPercentageRaw,
      totalAttempts: submittedAttempts.length,
      maxAttempts,
      attemptsRemaining: maxAttempts - submittedAttempts.length,
      inProgress: allAttempts.some((a) => a.submittedAt == null),
    });
  } catch (error) {
    console.error('Error fetching attempts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attempts' },
      { status: 500 },
    );
  }
}
