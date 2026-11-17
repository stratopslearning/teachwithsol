/**
 * "Hide feedback until due": while the quiz is open, students don't see
 * per-question feedback or answer keys. Teaching staff always see them.
 * Stored in quizzes.hide_feedback_after_due (it used to be a marker inside
 * the quiz description).
 */
export function shouldHideFeedbackForStudent(
  quiz: { endDate: Date | string | null; hideFeedbackAfterDue?: boolean | null },
  userRole: string,
  now: Date = new Date(),
): boolean {
  if (userRole === 'ADMIN' || userRole === 'PROFESSOR') return false;
  if (!quiz.hideFeedbackAfterDue) return false;
  if (!quiz.endDate) return false;
  return now <= new Date(quiz.endDate);
}
