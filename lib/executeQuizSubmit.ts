import { eq, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { questions, sections } from '@/app/db/schema';
import { authorize } from '@/lib/authz';
import { scheduleAttemptRetry } from '@/lib/backgroundRetry';
import { loadExamContext, missingExamResource } from '@/lib/examContext';
import { mergeAttemptAnswers } from '@/lib/shouldForceAutoSubmit';
import { resolveAttemptSectionId } from '@/lib/resolveAttemptSection';
import { assertQuizSubmitWindow } from '@/lib/quizSubmitPolicy';
import { scoreSubmittedQuestions } from '@/lib/scoreSubmittedQuestions';
import {
  isSectionConcluded,
  SECTION_CONCLUDED_MESSAGE,
} from '@/lib/sectionAvailability';
import { maybeEncryptAttemptAnswers } from '@/lib/crypto/fieldEncryption';
import { getLatestQuizVersionId } from '@/lib/quiz/versions';
import { assertOfferingWritable } from '@/lib/offerings/lifecycle';
import { ApiError } from '@/lib/api/errors';
import { normalizeDatabaseDate } from '@/lib/utils';

function rowsFromExecute<T>(result: unknown): T[] {
  return (
    (result as { rows?: T[] }).rows ??
    (Array.isArray(result) ? (result as T[]) : [])
  );
}

function parseJsonb<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return raw as T;
}

export class MaxAttemptsExceededError extends Error {
  constructor(public readonly maxAttempts: number) {
    super('Max attempts exceeded');
    this.name = 'MaxAttemptsExceededError';
  }
}

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
  // Same rule as start: archived quizzes take no new submissions. Server
  // auto-submit (bypassAvailability) may still close out a saved attempt.
  if (!bypassAvailability && !quiz.isActive) {
    throw new ApiError({
      status: 400,
      message: 'This quiz is no longer available.',
      extras: { quizArchived: true },
    });
  }

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

  // Start and the quiz page let a student resume an attempt after the section
  // ends, so submit must accept it too — but only for an attempt begun while
  // the section was still open.
  const sectionEndsAt = normalizeDatabaseDate(
    (sectionRow as { endsAt?: Date | string | null }).endsAt ?? null,
  );
  const resumingPreEndAttempt =
    inProgressAttempt != null &&
    sectionEndsAt != null &&
    new Date(inProgressAttempt.startedAt).getTime() <= sectionEndsAt.getTime();
  if (
    !bypassAvailability &&
    isSectionConcluded(sectionRow as { endsAt?: Date | null }, now) &&
    !resumingPreEndAttempt
  ) {
    throw new Error(SECTION_CONCLUDED_MESSAGE);
  }
  // Wave 3 (23): ended / archived offerings are read-only for submissions.
  if (!bypassAvailability) {
    await assertOfferingWritable(sectionRow.offeringId, now);
  }

  if (!inProgressAttempt && attemptCount >= quiz.maxAttempts) {
    throw new MaxAttemptsExceededError(quiz.maxAttempts);
  }

  const submitTime = now;
  const attemptStartTime: Date = inProgressAttempt
    ? inProgressAttempt.startedAt instanceof Date
      ? inProgressAttempt.startedAt
      : new Date(inProgressAttempt.startedAt)
    : submitTime;

  // Only server-trusted bypassAvailability may skip due/end/timer windows.
  // Client autoSubmitted is telemetry only and must never unlock late submits.
  assertQuizSubmitWindow({
    bypassAvailability,
    quiz,
    assignment,
    attemptStartTime,
    submitTime,
  });

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
  const passingScore = quiz.passingScore ?? 60;
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
    scheduleAttemptRetry(attempt.id);
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
