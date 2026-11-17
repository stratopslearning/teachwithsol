import type { StoredFeedback } from '@/lib/grading/types';

import {
  buildLegacyQuestionKeyMap,
  resolveAttemptAnswer,
  resolveAttemptFeedback,
  type QuizQuestionRef,
} from '@/lib/quiz/attemptAnswers';

export type QuizQuestionForStats = QuizQuestionRef & {
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  points: number;
  question: string;
  conceptTags?: string[] | null;
};

export type AttemptForQuestionStats = {
  answers?: unknown;
  gptFeedback?: unknown;
};

export type QuestionStatRow = QuizQuestionForStats & {
  attempts: number;
  correctAnswers: number;
  successRate: number;
};

/** Normalize jsonb / legacy string payloads into a plain object map. */
export function parseAttemptJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function hasNonEmptyAnswer(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ''
  );
}

function questionWasAttempted(
  question: QuizQuestionForStats,
  answers: Record<string, unknown>,
  gptFeedback: Record<string, unknown>,
  keyMap: Map<string, string>,
): boolean {
  const answerValue = resolveAttemptAnswer(question.id, answers, keyMap);
  if (hasNonEmptyAnswer(answerValue)) return true;

  if (question.type === 'SHORT_ANSWER') {
    return (
      resolveAttemptFeedback(
        question.id,
        gptFeedback as Record<string, StoredFeedback>,
        keyMap,
      ) != null
    );
  }

  return false;
}

function questionWasCorrect(
  question: QuizQuestionForStats,
  answers: Record<string, unknown>,
  gptFeedback: Record<string, unknown>,
  keyMap: Map<string, string>,
): boolean {
  if (question.type === 'SHORT_ANSWER') {
    const feedback = resolveAttemptFeedback(
      question.id,
      gptFeedback as Record<string, StoredFeedback>,
      keyMap,
    );
    return feedback?.score === question.points;
  }

  const answerValue = resolveAttemptAnswer(question.id, answers, keyMap);
  return String(answerValue) === question.correctAnswer;
}

/**
 * Per-question attempt/success counts for professor quiz diagnostics.
 * Uses the same answer + gpt_feedback resolution as attempt review pages.
 */
export function computeQuestionStatsForAttempts(
  questions: QuizQuestionForStats[],
  attempts: AttemptForQuestionStats[],
): QuestionStatRow[] {
  const questionRefs: QuizQuestionRef[] = questions.map((q) => ({
    id: q.id,
    order: q.order,
    question: q.question,
    correctAnswer: q.correctAnswer,
  }));

  const parsedAttempts = attempts.map((attempt) => {
    const answers = parseAttemptJsonRecord(attempt.answers);
    const gptFeedback = parseAttemptJsonRecord(attempt.gptFeedback);
    const keyMap = buildLegacyQuestionKeyMap(
      questionRefs,
      answers,
      gptFeedback,
    );
    return { answers, gptFeedback, keyMap };
  });

  return questions.map((question) => {
    let attemptCount = 0;
    let correctCount = 0;

    for (const payload of parsedAttempts) {
      if (
        !questionWasAttempted(
          question,
          payload.answers,
          payload.gptFeedback,
          payload.keyMap,
        )
      ) {
        continue;
      }
      attemptCount += 1;
      if (
        questionWasCorrect(
          question,
          payload.answers,
          payload.gptFeedback,
          payload.keyMap,
        )
      ) {
        correctCount += 1;
      }
    }

    return {
      ...question,
      attempts: attemptCount,
      correctAnswers: correctCount,
      successRate:
        attemptCount > 0
          ? Math.round((correctCount / attemptCount) * 100)
          : 0,
    };
  });
}
