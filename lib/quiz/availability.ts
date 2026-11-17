import { normalizeDatabaseDate } from '@/lib/utils';

export type QuizAvailabilityBlockReason =
  | 'quizNotStarted'
  | 'quizEnded'
  | 'dueDatePassed';

export type QuizAvailabilityResult =
  | { allowed: true }
  | { allowed: false; reason: QuizAvailabilityBlockReason };

/**
 * Whether a student may start or submit a quiz right now.
 *
 * - `quiz.endDate` is the primary close time (professor-controlled).
 * - `assignment.dueDate` applies only when the quiz has no `endDate`.
 *   Extending `quiz.endDate` therefore re-opens the window even if the
 *   per-student assignment due is earlier.
 */
export function getQuizAvailability(
  quiz: {
    startDate?: Date | string | null;
    endDate?: Date | string | null;
  },
  assignment: { dueDate?: Date | string | null },
  now: Date = new Date(),
): QuizAvailabilityResult {
  const startDate = normalizeDatabaseDate(quiz.startDate);
  const endDate = normalizeDatabaseDate(quiz.endDate);
  const assignmentDueDate = normalizeDatabaseDate(assignment.dueDate);

  if (startDate && now < startDate) {
    return { allowed: false, reason: 'quizNotStarted' };
  }
  if (endDate && now > endDate) {
    return { allowed: false, reason: 'quizEnded' };
  }
  if (!endDate && assignmentDueDate && now > assignmentDueDate) {
    return { allowed: false, reason: 'dueDatePassed' };
  }
  return { allowed: true };
}

/**
 * When submissions close for this student: `quiz.endDate`, else the
 * assignment due date (same precedence as `getQuizAvailability`). Use this for
 * client countdowns / auto-submit so they match what the server enforces.
 */
export function effectiveQuizCloseDate(
  quiz: { endDate?: Date | string | null },
  assignment: { dueDate?: Date | string | null },
): Date | null {
  return (
    normalizeDatabaseDate(quiz.endDate) ??
    normalizeDatabaseDate(assignment.dueDate)
  );
}

/**
 * Whether a published quiz should appear in student lists (dashboard, My
 * quizzes). Taking is gated separately by `getQuizAvailability`.
 *
 * Hidden until `startDate` so a later chapter does not show up as "Not open
 * yet". it simply is not offered yet.
 */
export function isQuizListedForStudents(
  quiz: {
    isActive?: boolean | null;
    deletedAt?: Date | string | null;
    startDate?: Date | string | null;
  },
  now: Date = new Date(),
): boolean {
  if (quiz.deletedAt != null) return false;
  if (!quiz.isActive) return false;
  const startDate = normalizeDatabaseDate(quiz.startDate);
  if (startDate && now < startDate) return false;
  return true;
}

/** Whether the quiz window has closed (due date / end date), not "not started yet". */
export function isQuizWindowClosed(
  quiz: {
    startDate?: Date | string | null;
    endDate?: Date | string | null;
  },
  assignment: { dueDate?: Date | string | null },
  now: Date = new Date(),
): boolean {
  const availability = getQuizAvailability(quiz, assignment, now);
  return (
    !availability.allowed &&
    (availability.reason === 'quizEnded' ||
      availability.reason === 'dueDatePassed')
  );
}
