/**
 * Whether a student may start or submit a quiz, decided in one place.
 *
 * Returns a typed reason plus the exact message and response flag the UI
 * and API clients already rely on. Callers throw `QuizAccessError` (an
 * ApiError), so routes never need to match error text.
 */
import { ApiError } from '@/lib/api/errors';
import { getQuizAvailability } from '@/lib/quizAvailability';
import { getElapsedMinutes, isTimeLimitExceeded } from '@/lib/quizTimeLimit';
import { isSectionConcluded, SECTION_CONCLUDED_MESSAGE } from '@/lib/sectionAvailability';
import { normalizeDatabaseDate } from '@/lib/utils';

export type QuizAction = 'start' | 'submit';

export type QuizAccessReason =
  | 'archived'
  | 'notStarted'
  | 'ended'
  | 'dueDatePassed'
  | 'sectionConcluded'
  | 'maxAttempts'
  | 'timeLimit';

/** Response flag per reason (kept for API clients that read them). */
const FLAG: Record<QuizAccessReason, string> = {
  archived: 'quizArchived',
  notStarted: 'quizNotStarted',
  ended: 'quizEnded',
  dueDatePassed: 'dueDatePassed',
  sectionConcluded: 'sectionConcluded',
  maxAttempts: 'maxAttemptsReached',
  timeLimit: 'timeLimitExceeded',
};

export class QuizAccessError extends ApiError {
  constructor(
    readonly reason: QuizAccessReason,
    message: string,
  ) {
    super({ status: 400, message, code: 'bad_request', extras: { [FLAG[reason]]: true } });
  }
}

function message(
  reason: QuizAccessReason,
  action: QuizAction,
  detail: { maxAttempts?: number; timeLimit?: number; elapsedMinutes?: number },
): string {
  const closed = action === 'submit' ? ' Submissions are no longer accepted.' : '';
  switch (reason) {
    case 'archived':
      return 'This quiz is no longer available.';
    case 'notStarted':
      return 'This quiz has not started yet.';
    case 'ended':
      return `This quiz has ended.${closed}`;
    case 'dueDatePassed':
      return `The due date for this assignment has passed.${closed}`;
    case 'sectionConcluded':
      return SECTION_CONCLUDED_MESSAGE;
    case 'maxAttempts':
      return `Maximum attempts (${detail.maxAttempts}) reached for this quiz. You cannot retake this quiz.`;
    case 'timeLimit':
      return `Time limit exceeded. The quiz has a ${detail.timeLimit} minute time limit, but ${Math.ceil(detail.elapsedMinutes ?? 0)} minutes have elapsed.`;
  }
}

/** Raised when a new attempt would exceed the quiz's attempt limit. */
export class MaxAttemptsExceededError extends QuizAccessError {
  constructor(readonly maxAttempts: number) {
    super('maxAttempts', message('maxAttempts', 'submit', { maxAttempts }));
    this.name = 'MaxAttemptsExceededError';
  }
}

export type QuizAccessContext = {
  quiz: {
    isActive?: boolean | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    timeLimit?: number | null;
    maxAttempts: number;
  };
  assignment: { dueDate?: Date | string | null };
  section?: { endsAt?: Date | string | null } | null;
  inProgressAttempt?: { startedAt: Date | string } | null;
  submittedCount: number;
  now: Date;
};

export type QuizAccessResult =
  | { ok: true }
  | { ok: false; reason: QuizAccessReason; error: QuizAccessError };

function deny(
  reason: QuizAccessReason,
  action: QuizAction,
  detail: Parameters<typeof message>[2] = {},
): QuizAccessResult {
  const error =
    reason === 'maxAttempts' && detail.maxAttempts != null
      ? new MaxAttemptsExceededError(detail.maxAttempts)
      : new QuizAccessError(reason, message(reason, action, detail));
  return { ok: false, reason, error };
}

/**
 * Checks, in order: archived → section ended → attempt limit → quiz window /
 * due date → time limit (submit only).
 *
 * - An in-progress attempt may continue after the section ends, but only if
 *   it started before `section.endsAt`.
 * - `start` doesn't enforce the attempt limit here: start resolves an
 *   existing attempt first (resume / auto-submit) and checks it itself.
 */
export function evaluateQuizAccess(
  ctx: QuizAccessContext,
  action: QuizAction,
): QuizAccessResult {
  const { quiz, assignment, section, inProgressAttempt, submittedCount, now } = ctx;

  if (!quiz.isActive) return deny('archived', action);

  if (isSectionConcluded(section ?? null, now)) {
    const endsAt = normalizeDatabaseDate(section?.endsAt ?? null);
    const startedBeforeEnd =
      inProgressAttempt != null &&
      endsAt != null &&
      new Date(inProgressAttempt.startedAt).getTime() <= endsAt.getTime();
    if (!startedBeforeEnd) return deny('sectionConcluded', action);
  }

  if (action === 'submit' && !inProgressAttempt && submittedCount >= quiz.maxAttempts) {
    return deny('maxAttempts', action, { maxAttempts: quiz.maxAttempts });
  }

  const availability = getQuizAvailability(quiz, assignment, now);
  if (!availability.allowed) {
    const reason: QuizAccessReason =
      availability.reason === 'quizNotStarted'
        ? 'notStarted'
        : availability.reason === 'quizEnded'
          ? 'ended'
          : 'dueDatePassed';
    return deny(reason, action);
  }

  if (action === 'submit' && quiz.timeLimit) {
    const started = inProgressAttempt ? new Date(inProgressAttempt.startedAt) : now;
    if (isTimeLimitExceeded(quiz.timeLimit, started, now)) {
      return deny('timeLimit', action, {
        timeLimit: quiz.timeLimit,
        elapsedMinutes: getElapsedMinutes(started, now),
      });
    }
  }

  return { ok: true };
}

/** The error for one reason, for checks a route must run before the rest. */
export function quizAccessError(reason: Exclude<QuizAccessReason, 'maxAttempts' | 'timeLimit'>, action: QuizAction): QuizAccessError {
  return new QuizAccessError(reason, message(reason, action, {}));
}

export function assertQuizAccess(ctx: QuizAccessContext, action: QuizAction): void {
  const result = evaluateQuizAccess(ctx, action);
  if (!result.ok) throw result.error;
}
