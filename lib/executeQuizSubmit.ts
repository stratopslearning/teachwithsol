import { eq, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { questions, sections } from '@/app/db/schema';
import { authorize } from '@/lib/authz';
import { scheduleAttemptRetry } from '@/lib/backgroundRetry';
import { loadExamContext, missingExamResource } from '@/lib/examContext';
import { mergeAttemptAnswers } from '@/lib/shouldForceAutoSubmit';
import { resolveAttemptSectionId } from '@/lib/resolveAttemptSection';
import { assertQuizAccess, MaxAttemptsExceededError } from '@/lib/quiz/accessPolicy';
import { scoreSubmittedQuestions } from '@/lib/scoreSubmittedQuestions';
import { parseJsonb, rowsFromExecute } from '@/lib/db/rows';
import { maybeEncryptAttemptAnswers } from '@/lib/crypto/fieldEncryption';
import { getLatestQuizVersionId } from '@/lib/quiz/versions';
import { assertOfferingWritable } from '@/lib/offerings/lifecycle';
import { DEFAULT_PASSING_SCORE } from '@/lib/quizSchemas';

export { MaxAttemptsExceededError } from '@/lib/quiz/accessPolicy';

export type ExecuteQuizSubmitInput = {
  quizId: string;
  assignmentId: string;
  studentId: string;
  answers: Record<string, string>;
  autoSubmitted: boolean;
  /** Timer/due-date auto-submit: allow past quiz end and grace window. */
  bypassAvailability?: boolean;
};

export type ExecuteQuizSubmitResult = {
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  attemptNumber: number;
  totalAttempts: number;
  maxAttempts: number;
  bestScore: number;
  bestPercentage: number;
  attemptsRemaining: number;
  gradingStatus: 'complete' | 'partial';
  pendingQuestionCount: number;
};

export async function executeQuizSubmit(
  input: ExecuteQuizSubmitInput,
): Promise<ExecuteQuizSubmitResult> {
  const {
    quizId,
    assignmentId,
    studentId,
    answers: incomingAnswers,
    bypassAvailability = false,
  } = input;

  const ctx = await loadExamContext({ quizId, assignmentId, studentId });
  const missing = missingExamResource(ctx.assignment, ctx.quiz);
  if (missing === 'assignment') {
    throw new Error('Assignment not found');
  }
  if (missing === 'quiz') {
    throw new Error('Quiz not found');
  }
  const assignment = ctx.assignment!;
  const quiz = ctx.quiz!;

  const now = new Date();

  const quizSectionIds = ctx.quizSectionLinks.map((qs) => qs.sectionId);
  const sectionId = await resolveAttemptSectionId(studentId, quizSectionIds);
  if (!sectionId) {
    throw new Error('No valid section found for this quiz/assignment');
  }

  const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
  const section = await fetchSectionById(sectionId);
  if (!section) {
    // Fallback bare read only when DEFINER misses (should not happen).
    const bare = await db.query.sections.findFirst({
      where: eq(sections.id, sectionId),
    });
    if (!bare) throw new Error('Section not found');
  }
  const sectionRow = section ?? {
    endsAt: null,
    offeringId: null as string | null,
    tenantId: null as string | null,
    workspaceId: null as string | null,
  };
  const tenantId = sectionRow.tenantId ?? sectionRow.workspaceId;
  if (!tenantId) {
    throw new Error('Section is missing tenant — cannot submit');
  }
  const canSubmit = await authorize(
    { id: studentId, platformStaff: false },
    'student.submit',
    {
      tenantId,
      scopeType: 'section',
      scopeId: sectionId,
    },
  );
  if (!canSubmit) {
    throw new Error('Not authorized to submit this quiz');
  }

  const inProgressAttempt = ctx.inProgressAttempt;
  const attemptCount = ctx.submittedCount;

  const submitTime = now;
  const attemptStartTime: Date = inProgressAttempt
    ? inProgressAttempt.startedAt instanceof Date
      ? inProgressAttempt.startedAt
      : new Date(inProgressAttempt.startedAt)
    : submitTime;

  if (bypassAvailability) {
    // Server auto-submit of a saved attempt: only the attempt limit applies.
    if (!inProgressAttempt && attemptCount >= quiz.maxAttempts) {
      throw new MaxAttemptsExceededError(quiz.maxAttempts);
    }
  } else {
    // Client autoSubmitted is telemetry only and never unlocks late submits.
    assertQuizAccess(
      {
        quiz,
        assignment,
        section: sectionRow as { endsAt?: Date | string | null },
        inProgressAttempt,
        submittedCount: attemptCount,
        now,
      },
      'submit',
    );
    // Wave 3 (23): ended / archived offerings are read-only for submissions.
    await assertOfferingWritable(sectionRow.offeringId, now);
  }

  const savedAnswers = inProgressAttempt?.answers ?? {};
  const answers = mergeAttemptAnswers(savedAnswers, incomingAnswers);

  const quizQuestions = await db.query.questions.findMany({
    where: eq(questions.quizId, quizId),
  });

  const { totalScore, maxScore, gptFeedback, pendingQuestionIds } =
    await scoreSubmittedQuestions(quizQuestions, answers, {
      courseId: section?.courseId ?? null,
    });

  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passingScore = quiz.passingScore ?? DEFAULT_PASSING_SCORE;
  const passed = maxScore > 0 ? percentage >= passingScore : false;
  const attemptGradingStatus: 'complete' | 'partial' =
    pendingQuestionIds.length > 0 ? 'partial' : 'complete';
  const currentAttemptNumber = attemptCount + 1;
  const storedAnswers = maybeEncryptAttemptAnswers(answers);
  const quizVersionId = await getLatestQuizVersionId(quizId);

  let submitResult: {
    attempt: { id: string; score: number | null };
    allAttempts: Array<{ score: number | null }>;
  };
  try {
    const result = await db.execute(sql`
      SELECT sol_submit_quiz_attempt(${JSON.stringify({
        assignmentId,
        studentId,
        quizId,
        sectionId,
        maxAttempts: quiz.maxAttempts,
        answers: storedAnswers,
        quizVersionId,
        score: totalScore,
        maxScore,
        percentage,
        passed,
        gptFeedback: {
          ...gptFeedback,
          attemptNumber: currentAttemptNumber,
          totalAttempts: attemptCount + 1,
          maxAttempts: quiz.maxAttempts,
        },
        gradingStatus: attemptGradingStatus,
        startedAt: attemptStartTime.toISOString(),
        submittedAt: submitTime.toISOString(),
      })}::jsonb) AS row
    `);
    const parsed = parseJsonb<{
      attempt: { id: string; score: number | null };
      allAttempts: Array<{ score: number | null }>;
    }>(rowsFromExecute<{ row: unknown }>(result)[0]?.row);
    if (!parsed?.attempt?.id) {
      throw new Error('sol_submit_quiz_attempt returned no attempt');
    }
    submitResult = parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Max attempts exceeded')) {
      throw new MaxAttemptsExceededError(quiz.maxAttempts);
    }
    throw err;
  }
  const { attempt, allAttempts } = submitResult;

  if (pendingQuestionIds.length > 0) {
    scheduleAttemptRetry(attempt.id, tenantId);
  } else {
    const { enqueueQuizPassback } = await import('@/lib/lti/passback');
    void enqueueQuizPassback({ attemptId: attempt.id }).catch((err) =>
      console.error('LTI quiz passback enqueue failed', err),
    );
  }

  const bestScore = Math.max(...allAttempts.map((a) => a.score || 0));
  const bestPercentage = maxScore > 0 ? Math.round((bestScore / maxScore) * 100) : 0;

  return {
    attemptId: attempt.id,
    score: totalScore,
    maxScore,
    percentage,
    passed,
    attemptNumber: currentAttemptNumber,
    totalAttempts: attemptCount + 1,
    maxAttempts: quiz.maxAttempts,
    bestScore,
    bestPercentage,
    attemptsRemaining: quiz.maxAttempts - (attemptCount + 1),
    gradingStatus: attemptGradingStatus,
    pendingQuestionCount: pendingQuestionIds.length,
  };
}
