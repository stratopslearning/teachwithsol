import { describe, expect, it } from 'vitest';

import { ensureQuizAssignmentDefaults } from '@/lib/authoring/schedule';
import { DEFAULT_PASSING_SCORE, quizCreateBaseSchema } from '@/lib/quiz/schemas';

// Regression: authored quizzes defaulted to 70% while hand-built quizzes,
// grading and the DB column defaulted to 60%.
describe('one passing-score default', () => {
  it('is the DB column default', () => {
    expect(DEFAULT_PASSING_SCORE).toBe(60);
  });

  it('applies to quizzes created through the API schema', () => {
    const parsed = quizCreateBaseSchema.parse({
      title: 'Q',
      sectionIds: ['s1'],
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-08T00:00:00.000Z',
      questions: [],
    });
    expect(parsed.passingScore).toBe(DEFAULT_PASSING_SCORE);
  });

  it('applies to AI-authored quizzes without a passing score', () => {
    const body = ensureQuizAssignmentDefaults({ questions: [] }, 0, new Date('2026-01-01'));
    expect(body.passingScore).toBe(DEFAULT_PASSING_SCORE);
  });

  it('keeps an explicit passing score', () => {
    expect(ensureQuizAssignmentDefaults({ passingScore: 80 }, 0).passingScore).toBe(80);
  });
});
