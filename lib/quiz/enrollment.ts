/**
 * Take-page enrollment gate. Questions and lazy assignment must not run
 * unless this returns allowed: the page used to load the question bank
 * before proving the student is in a section the quiz is assigned to.
 *
 * `resolvedSectionId` is the result of `resolveAttemptSectionId`.
 */
export type QuizOpenDecision =
  | { allowed: true; sectionId: string }
  | { allowed: false; reason: 'not_enrolled' };

export function assertStudentCanOpenQuiz(
  resolvedSectionId: string | null,
): QuizOpenDecision {
  if (!resolvedSectionId) {
    return { allowed: false, reason: 'not_enrolled' };
  }
  return { allowed: true, sectionId: resolvedSectionId };
}
