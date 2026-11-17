import { describe, expect, it } from 'vitest';

import { assertStudentCanOpenQuiz } from '@/lib/quiz/enrollment';

describe('assertStudentCanOpenQuiz', () => {
  it('denies when no section was resolved (not enrolled / quiz has no sections)', () => {
    expect(assertStudentCanOpenQuiz(null)).toEqual({
      allowed: false,
      reason: 'not_enrolled',
    });
  });

  it('allows when enrollment resolved a section', () => {
    expect(assertStudentCanOpenQuiz('section-1')).toEqual({
      allowed: true,
      sectionId: 'section-1',
    });
  });
});
