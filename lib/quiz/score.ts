import { DEFAULT_PASSING_SCORE } from '@/lib/quiz/schemas';

/**
 * Percentage and pass/fail for an attempt. Used by submit, background
 * grading, regrade and professor overrides so they can't disagree.
 *
 * `maxScore` only counts graded questions: short answers still pending
 * grading are left out until they're scored.
 */
export function scoreOutcome(opts: {
  totalScore: number;
  maxScore: number;
  passingScore: number | null | undefined;
}): { percentage: number; passed: boolean } {
  const { totalScore, maxScore } = opts;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passingScore = opts.passingScore ?? DEFAULT_PASSING_SCORE;
  return { percentage, passed: maxScore > 0 ? percentage >= passingScore : false };
}
