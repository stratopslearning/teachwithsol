import { describe, expect, it } from 'vitest';

import { scoreOutcome } from '@/lib/quiz/score';
import { DEFAULT_PASSING_SCORE } from '@/lib/quiz/schemas';

describe('scoreOutcome', () => {
  it('rounds the percentage and compares it to the passing score', () => {
    expect(scoreOutcome({ totalScore: 2, maxScore: 3, passingScore: 67 })).toEqual({
      percentage: 67,
      passed: true,
    });
    expect(scoreOutcome({ totalScore: 2, maxScore: 3, passingScore: 70 })).toEqual({
      percentage: 67,
      passed: false,
    });
  });

  it('uses the default passing score when the quiz has none', () => {
    const atDefault = scoreOutcome({ totalScore: DEFAULT_PASSING_SCORE, maxScore: 100, passingScore: null });
    expect(atDefault.passed).toBe(true);
    const below = scoreOutcome({ totalScore: DEFAULT_PASSING_SCORE - 1, maxScore: 100, passingScore: undefined });
    expect(below.passed).toBe(false);
  });

  it('never passes an attempt with nothing graded yet', () => {
    expect(scoreOutcome({ totalScore: 0, maxScore: 0, passingScore: 0 })).toEqual({
      percentage: 0,
      passed: false,
    });
  });
});
