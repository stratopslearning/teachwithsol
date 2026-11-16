import { fetchSectionById } from '@/lib/db/entityScopedReads';
import {
  loadActiveQuiz,
  loadAttemptForGrading,
  loadQuizQuestions,
  saveAttemptGrading,
} from '@/lib/quiz/gradingData';
import {
  buildLegacyQuestionKeyMap,
  resolveAttemptAnswer,
  resolveAttemptFeedback,
} from '@/lib/quizAttemptAnswers';
import {
  gradeMultipleQuestions,
  outcomeToFeedback,
  type GradingRequest,
} from '@/lib/grading';
import { getOrDeriveRubric } from '@/lib/gradingRubric';
import { isGradedStatus, type StoredFeedback } from '@/lib/gradingTypes';
import { scoreOutcome } from '@/lib/quiz/score';

/**
 * Legacy fallback feedback message left over from the old grader. Kept for
 * backwards compat with attempts that were graded before the redesign.
 */
export const FALLBACK_FEEDBACK_SNIPPET = 'Grading system temporarily unavailable';

const FEEDBACK_METADATA_KEYS = new Set([
  'maxAttempts',
  'attemptNumber',
  'totalAttempts',
]);

function copyFeedbackMetadata(
  existingFeedback: Record<string, unknown>,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(existingFeedback)) {
    if (FEEDBACK_METADATA_KEYS.has(key)) {
      metadata[key] = value;
    }
  }

  return metadata;
}

/**
 * A feedback entry "needs re-grading" if it's either the legacy fallback or
 * marked `pending` / `manual_review` by the new pipeline. Both signal that
 * the student doesn't yet have an authoritative score for that question.
 */
export function isFallbackGradingFeedback(feedback: unknown): boolean {
  if (!feedback || typeof feedback !== 'object') {
    return false;
  }

  const value = feedback as StoredFeedback & { feedback?: string; confidence?: number };

  if (!isGradedStatus(value.status)) {
    return true;
  }

  return (
    (typeof value.feedback === 'string' &&
      value.feedback.includes(FALLBACK_FEEDBACK_SNIPPET)) ||
    value.confidence === 30
  );
}

export function isPendingFeedback(feedback: unknown): boolean {
  if (!feedback || typeof feedback !== 'object') return false;
  const value = feedback as StoredFeedback;
  return value.status === 'pending' || value.status === 'manual_review';
}

type RegradeAttemptOptions = {
  /** When true, only regrade questions that look like fallback/pending. Defaults to true. */
  fallbackOnly?: boolean;
  /** Promote remaining pending questions to manual_review after this many attempts. */
  maxRetries?: number;
};

export type RegradeAttemptResult = {
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  gradingStatus: 'complete' | 'partial' | 'failed';
  regradedQuestionCount: number;
  fallbackQuestionCount: number;
  pendingQuestionCount: number;
};

export async function regradeAttempt(
  attemptId: string,
  options: RegradeAttemptOptions = {},
): Promise<RegradeAttemptResult> {
  // FORCE RLS: plain db reads/updates see no rows without a tenant, so load
  // the attempt via a SECURITY DEFINER lookup and work under its tenant.
  const attempt = await loadAttemptForGrading(attemptId);

  if (!attempt) {
    throw new Error('Attempt not found');
  }

  if (!attempt.submittedAt) {
    throw new Error('Only submitted attempts can be re-graded');
  }

  const tenantId = attempt.tenantId;
  if (!tenantId) {
    throw new Error(`Attempt ${attemptId} has no tenant`);
  }

  const quiz = await loadActiveQuiz(attempt.quizId, tenantId);

  if (!quiz) {
    throw new Error('Quiz not found');
  }

  const quizQuestions = await loadQuizQuestions(attempt.quizId, tenantId);

  let courseId: string | undefined;
  if (attempt.sectionId) {
    const section = await fetchSectionById(attempt.sectionId);
    courseId = section?.courseId;
  }

  const studentAnswers =
    attempt.answers && typeof attempt.answers === 'object'
      ? (attempt.answers as Record<string, unknown>)
      : {};
  const existingFeedback =
    attempt.gptFeedback && typeof attempt.gptFeedback === 'object'
      ? (attempt.gptFeedback as Record<string, unknown>)
      : {};

  const questionKeyMap = buildLegacyQuestionKeyMap(
    quizQuestions.map((question) => ({
      id: question.id,
      order: question.order,
      question: question.question,
      correctAnswer: question.correctAnswer,
    })),
    studentAnswers,
    existingFeedback,
  );

  let totalScore = 0;
  let maxScore = 0;
  const nextFeedback = copyFeedbackMetadata(existingFeedback);
  const shortAnswerGradingRequests: Array<{
    questionId: string;
    maxPoints: number;
    previousAttempts: number;
    request: GradingRequest;
  }> = [];

  let fallbackQuestionCount = 0;
  const maxRetries = Math.max(1, options.maxRetries ?? 3);
  const fallbackOnly = options.fallbackOnly ?? true;

  for (const question of quizQuestions) {
    const answerValue = resolveAttemptAnswer(
      question.id,
      studentAnswers,
      questionKeyMap,
    );
    const answerText =
      answerValue === undefined || answerValue === null
        ? ''
        : String(answerValue).trim();

    if (question.type === 'MULTIPLE_CHOICE' || question.type === 'TRUE_FALSE') {
      maxScore += question.points;
      if (answerText && answerText === question.correctAnswer) {
        totalScore += question.points;
      }
      continue;
    }

    if (question.type !== 'SHORT_ANSWER') {
      continue;
    }

    const currentFeedback = resolveAttemptFeedback(
      question.id,
      existingFeedback,
      questionKeyMap,
    ) as StoredFeedback | undefined;

    if (isFallbackGradingFeedback(currentFeedback)) {
      fallbackQuestionCount += 1;
    }

    if (!answerText) {
      maxScore += question.points;
      nextFeedback[question.id] = {
        score: 0,
        feedback: 'Please read the textbook and try again.',
        confidence: 100,
        maxPoints: question.points,
        status: 'graded',
      } satisfies StoredFeedback;
      continue;
    }

    const shouldRegrade =
      !fallbackOnly || isFallbackGradingFeedback(currentFeedback);

    if (!shouldRegrade) {
      const priorScore =
        currentFeedback && typeof currentFeedback.score === 'number'
          ? currentFeedback.score
          : 0;
      maxScore += question.points;
      totalScore += priorScore;
      // Preserve the prior feedback verbatim (still graded).
      nextFeedback[question.id] = currentFeedback ?? {
        score: priorScore,
        feedback: '',
        confidence: 80,
        maxPoints: question.points,
        status: 'graded',
      };
      continue;
    }

    const { rubric, rubricVersion } = await getOrDeriveRubric({
      id: question.id,
      question: question.question,
      correctAnswer: question.correctAnswer,
      rubric: question.rubric,
      rubricVersion: question.rubricVersion ?? 1,
      tenantId: question.tenantId,
    });

    shortAnswerGradingRequests.push({
      questionId: question.id,
      maxPoints: question.points,
      previousAttempts: (currentFeedback?.attempts ?? 0) as number,
      request: {
        question: question.question,
        studentAnswer: answerText,
        correctAnswer: question.correctAnswer || undefined,
        maxPoints: question.points,
        questionType: 'SHORT_ANSWER',
        questionId: question.id,
        rubric,
        rubricVersion,
        courseId,
      },
    });
  }

  let pendingQuestionCount = 0;

  if (shortAnswerGradingRequests.length > 0) {
    const gradingResults = await gradeMultipleQuestions(
      shortAnswerGradingRequests.map((item) => item.request),
      { concurrency: 5, perQuestionTimeoutMs: 30_000 },
    );

    shortAnswerGradingRequests.forEach((item, index) => {
      const outcome = gradingResults[index]!;
      const stored = outcomeToFeedback(outcome, {
        previousAttempts: item.previousAttempts,
      });

      // Promote chronically failing questions to manual_review so the
      // background worker stops retrying and the professor sees a flag.
      if (
        stored.status === 'pending' &&
        (stored.attempts ?? 0) >= maxRetries
      ) {
        stored.status = 'manual_review';
      }

      nextFeedback[item.questionId] = stored;

      if (stored.status === 'graded') {
        maxScore += item.maxPoints;
        totalScore += stored.score ?? 0;
      } else {
        pendingQuestionCount += 1;
      }
    });
  }

  const { percentage, passed } = scoreOutcome({
    totalScore,
    maxScore,
    passingScore: quiz.passingScore,
  });
  const gradingStatus: 'complete' | 'partial' | 'failed' =
    pendingQuestionCount === 0
      ? 'complete'
      : Object.values(nextFeedback).some(
            (entry) =>
              entry &&
              typeof entry === 'object' &&
              (entry as StoredFeedback).status === 'manual_review',
          )
        ? 'failed'
        : 'partial';

  await saveAttemptGrading(tenantId, attemptId, {
    score: totalScore,
    maxScore,
    percentage,
    passed,
    gptFeedback: nextFeedback,
    gradingStatus,
  });

  if (gradingStatus === 'complete') {
    const { enqueueQuizPassback } = await import('@/lib/lti/passback');
    void enqueueQuizPassback({ attemptId }).catch((err) =>
      console.error('LTI quiz passback enqueue failed', err),
    );
  }

  return {
    attemptId,
    score: totalScore,
    maxScore,
    percentage,
    passed,
    gradingStatus,
    regradedQuestionCount: shortAnswerGradingRequests.length,
    fallbackQuestionCount,
    pendingQuestionCount,
  };
}
