import { NextRequest, NextResponse } from 'next/server';

import { isStudentEntitled } from '@/lib/featureFlags';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { professorCanAccessQuiz, userCanWriteQuiz } from '@/lib/quizAccess';
import {
  fetchQuizQuestionsSafeDefiner,
  studentEnrolledInQuizDefiner,
} from '@/lib/db/studentWriteDefiners';
import { fetchQuizById } from '@/lib/db/entityScopedReads';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ quizId: string }> },
) {
  try {
    const { quizId } = await params;

    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isStudentEntitled(user)) {
      return NextResponse.json({ error: 'Payment required' }, { status: 402 });
    }

    const quiz = await fetchQuizById(quizId);
    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const isStaff = await professorCanAccessQuiz(user, quizId);

    if (!isStaff) {
      const enrolled = await studentEnrolledInQuizDefiner(user.id, quizId);
      if (!enrolled) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const quizQuestions = await fetchQuizQuestionsSafeDefiner(quizId);

    const includeAnswerKey = isStaff && (await userCanWriteQuiz(user, quizId));
    // Safe definer already strips keys; staff writers need full bank via separate path.
    if (includeAnswerKey) {
      // FORCE RLS: the runtime role can't bypass RLS, so a plain db read
      // returned no questions. Read under the quiz's tenant.
      const { fetchQuizById } = await import('@/lib/db/entityScopedReads');
      const { loadQuizQuestions } = await import('@/lib/quiz/gradingData');
      const tenantId = (await fetchQuizById(quizId))?.tenantId;
      const full = tenantId ? await loadQuizQuestions(quizId, tenantId) : [];
      return NextResponse.json({ questions: full });
    }

    return NextResponse.json({ questions: quizQuestions });
  } catch (error) {
    console.error('Quiz questions error:', error);
    return NextResponse.json(
      { error: 'Failed to load questions' },
      { status: 500 },
    );
  }
}
