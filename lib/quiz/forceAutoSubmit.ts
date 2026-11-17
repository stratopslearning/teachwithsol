import { isQuizWindowClosed } from '@/lib/quiz/availability';
import {
  isNominalTimeLimitReached,
  isTimeLimitExceeded,
} from '@/lib/quiz/timeLimit';

export type ForceAutoSubmitReason = 'timer' | 'dueDate' | 'timeGrace';

/**
 * Whether an in-progress attempt should be finalized automatically
 * (client timer, closed quiz window, or server sweep).
 */
export function shouldForceAutoSubmitInProgress(options: {
  quiz: {
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    timeLimit?: number | null;
  };
  assignment: { dueDate?: Date | string | null };
  startedAt: Date;
  now?: Date;
}): { force: boolean; reason?: ForceAutoSubmitReason } {
  const now = options.now ?? new Date();
  const { quiz, assignment, startedAt } = options;

  if (isQuizWindowClosed(quiz, assignment, now)) {
    return { force: true, reason: 'dueDate' };
  }

  const timeLimit = quiz.timeLimit ?? null;
  if (timeLimit != null) {
    if (isNominalTimeLimitReached(timeLimit, startedAt, now)) {
      return { force: true, reason: 'timer' };
    }
    if (isTimeLimitExceeded(timeLimit, startedAt, now)) {
      return { force: true, reason: 'timeGrace' };
    }
  }

  return { force: false };
}

export function mergeAttemptAnswers(
  saved: unknown,
  incoming: Record<string, string>,
): Record<string, string> {
  const base =
    saved && typeof saved === 'object' && !Array.isArray(saved)
      ? (saved as Record<string, string>)
      : {};
  return { ...base, ...incoming };
}
