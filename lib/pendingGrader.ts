/**
 * Re-grade short-answer questions that the auto-grader left as `pending` or
 * `manual_review` on a single attempt.
 *
 * Used by:
 *   - The daily Vercel cron at /api/cron/grade-pending (long-tail safety net)
 *   - The background-retry hook fired from the submit handler and the
 *     student / professor view pages (the "self-healing on view / on
 *     submit" mechanism that lets us avoid a per-minute cron entirely).
 *
 * Idempotent: questions that are already `graded` are preserved verbatim.
 * Questions still pending after MAX_GRADING_ATTEMPTS retries are promoted to
 * `manual_review` so the worker stops retrying and the professor sees a
 * flag in the attention queue.
 */
import type { attempts } from '@/app/db/schema';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import {
  loadActiveQuiz,
  loadAttemptForGrading,
  loadQuizQuestions,
  saveAttemptGrading,
} from '@/lib/quiz/gradingData';
import {
  gradeMultipleQuestions,
  outcomeToFeedback,
  type GradingRequest,
} from '@/lib/grading';
import {
  buildLegacyQuestionKeyMap,
  resolveAttemptAnswer,
  resolveAttemptFeedback,
} from '@/lib/quizAttemptAnswers';
import { isPendingStatus, type StoredFeedback } from '@/lib/gradingTypes';
import { scoreOutcome } from '@/lib/quiz/score';

export const MAX_GRADING_ATTEMPTS = 3;

type AttemptRow = typeof attempts.$inferSelect;

export type GradePendingResult = {
  attemptId: string;
  regraded: number;
  stillPending: number;
  promoted: number;
};

export async function gradePendingForAttempt(
  attempt: AttemptRow,
): Promise<GradePendingResult> {
  const tenantId = attempt.tenantId;
  if (!tenantId) {
    throw new Error(`Attempt ${attempt.id} has no tenant`);
  }
  const quiz = await loadActiveQuiz(attempt.quizId, tenantId);
  if (!quiz) {
    return { attemptId: attempt.id, regraded: 0, stillPending: 0, promoted: 0 };
  }

  const quizQuestions = await loadQuizQuestions(attempt.quizId, tenantId);

  let courseId: string | undefined;
  let workspaceId: string | null = null;
  if (attempt.sectionId) {
    const section = await fetchSectionById(attempt.sectionId);
    courseId = section?.courseId;
    workspaceId = section?.workspaceId ?? null;
  }
  if (!workspaceId && courseId) {
    const { getCourseWorkspaceId } = await import('@/lib/workspace');
    workspaceId = await getCourseWorkspaceId(courseId);
  }

  const studentAnswers =
    attempt.answers && typeof attempt.answers === 'object'
      ? (attempt.answers as Record<string, unknown>)
      : {};
  const existingFeedback =
    attempt.gptFeedback && typeof attempt.gptFeedback === 'object'
      ? (attempt.gptFeedback as Record<string, unknown>)
      : {};

  const keyMap = buildLegacyQuestionKeyMap(
    quizQuestions.map((q) => ({
      id: q.id,
      order: q.order,
      question: q.question,
      correctAnswer: q.correctAnswer,
    })),
    studentAnswers,
    existingFeedback,
  );

  const nextFeedback: Record<string, unknown> = { ...existingFeedback };
  let totalScore = 0;
  let maxScore = 0;
  let stillPending = 0;
  const requests: Array<{
    questionId: string;
    maxPoints: number;
    previousAttempts: number;
    request: GradingRequest;
  }> = [];

  const { checkAiBandAvailable } = await import('@/lib/workspace/aiCapGuard');
  const aiCap = await checkAiBandAvailable(workspaceId);
  const aiBlocked = !aiCap.ok ? aiCap : null;

  for (const question of quizQuestions) {
    const answerValue = resolveAttemptAnswer(question.id, studentAnswers, keyMap);
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

    if (question.type !== 'SHORT_ANSWER') continue;

    const current = resolveAttemptFeedback(
      question.id,
      existingFeedback,
      keyMap,
    ) as StoredFeedback | undefined;

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

    if (!isPendingStatus(current?.status)) {
      const priorScore =
        current && typeof current.score === 'number' ? current.score : 0;
      maxScore += question.points;
      totalScore += priorScore;
      if (current) nextFeedback[question.id] = current;
      continue;
    }

    if (aiBlocked) {
      stillPending += 1;
      nextFeedback[question.id] = outcomeToFeedback(
        {
          status: 'pending',
          failureReason: 'ai_band_exceeded',
          maxPoints: question.points,
          feedback:
            'Grading is paused while this organization reaches its AI usage limit. Your instructor has been notified.',
          message: aiBlocked.reason,
        },
        { previousAttempts: current?.attempts ?? 0 },
      );
      continue;
    }

    const { getApprovedOrFallbackRubric } = await import(
      '@/lib/authoring/rubricApprove'
    );
    const resolved = await getApprovedOrFallbackRubric({
      id: question.id,
      question: question.question,
      correctAnswer: question.correctAnswer,
      rubric: question.rubric,
      rubricVersion: question.rubricVersion ?? 1,
      rubricStatus: (question as { rubricStatus?: string }).rubricStatus,
    });

    if (resolved.unapproved) {
      stillPending += 1;
      nextFeedback[question.id] = outcomeToFeedback(
        {
          status: 'manual_review',
          failureReason: 'rubric_unavailable',
          maxPoints: question.points,
          feedback:
            'This answer was sent for instructor review because the grading rubric is not yet approved.',
          confidence: 0,
          rubric: resolved.rubric,
          rubricMatches: [],
          modelVersion: 'n/a',
          rubricVersion: resolved.rubricVersion,
          promptVersion: '2026-11-05.1',
        },
        { previousAttempts: current?.attempts ?? 0 },
      );
      continue;
    }

    requests.push({
      questionId: question.id,
      maxPoints: question.points,
      previousAttempts: current?.attempts ?? 0,
      request: {
        question: question.question,
        studentAnswer: answerText,
        correctAnswer: question.correctAnswer || undefined,
        maxPoints: question.points,
        questionType: 'SHORT_ANSWER',
        questionId: question.id,
        rubric: resolved.rubric,
        rubricVersion: resolved.rubricVersion,
        courseId,
        workspaceId: workspaceId ?? undefined,
      },
    });
  }

  let regraded = 0;
  let promoted = 0;

  if (requests.length > 0) {
    const outcomes = await gradeMultipleQuestions(
      requests.map((r) => r.request),
      { concurrency: 3, perQuestionTimeoutMs: 40_000 },
    );

    requests.forEach((item, index) => {
      const outcome = outcomes[index]!;
      const stored = outcomeToFeedback(outcome, {
        previousAttempts: item.previousAttempts,
      });

      if (
        stored.status === 'pending' &&
        (stored.attempts ?? 0) >= MAX_GRADING_ATTEMPTS
      ) {
        stored.status = 'manual_review';
        promoted += 1;
      }
      if (outcome.status === 'manual_review') {
        promoted += 1;
      }

      nextFeedback[item.questionId] = stored;

      if (stored.status === 'graded') {
        maxScore += item.maxPoints;
        totalScore += stored.score ?? 0;
        regraded += 1;
      } else {
        stillPending += 1;
      }
    });
  }

  const { percentage, passed } = scoreOutcome({
    totalScore,
    maxScore,
    passingScore: quiz.passingScore,
  });
  const gradingStatus: 'complete' | 'partial' | 'failed' =
    stillPending === 0
      ? 'complete'
      : promoted > 0 ||
          Object.values(nextFeedback).some(
            (entry) =>
              entry &&
              typeof entry === 'object' &&
              (entry as StoredFeedback).status === 'manual_review',
          )
        ? 'failed'
        : 'partial';

  await saveAttemptGrading(tenantId, attempt.id, {
    score: totalScore,
    maxScore,
    percentage,
    passed,
    gptFeedback: nextFeedback,
    gradingStatus,
  });

  if (gradingStatus === 'complete') {
    const { enqueueQuizPassback } = await import('@/lib/lti/passback');
    void enqueueQuizPassback({ attemptId: attempt.id }).catch((err) =>
      console.error('LTI quiz passback enqueue failed', err),
    );
  }

  if (regraded > 0 && attempt.sectionId) {
    void (async () => {
      try {
        const section = await fetchSectionById(attempt.sectionId!);
        if (!section) return;
        const { getCourseWorkspaceId, recordAiUsage } = await import(
          '@/lib/workspace'
        );
        const workspaceId = await getCourseWorkspaceId(section.courseId);
        if (workspaceId) await recordAiUsage(workspaceId, 'grade', regraded);
      } catch (err) {
        console.warn('[pendingGrader] usage meter failed', err);
      }
    })();
  }

  return { attemptId: attempt.id, regraded, stillPending, promoted };
}

/** Convenience overload that loads the attempt row by id. */
export async function gradePendingForAttemptId(
  attemptId: string,
): Promise<GradePendingResult> {
  const attempt = await loadAttemptForGrading(attemptId);
  if (!attempt) {
    return { attemptId, regraded: 0, stillPending: 0, promoted: 0 };
  }
  return gradePendingForAttempt(attempt);
}
