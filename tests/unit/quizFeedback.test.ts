import { describe, expect, it } from 'vitest';

import { shouldHideFeedbackForStudent } from '@/lib/quiz/feedback';

describe('shouldHideFeedbackForStudent', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  const open = { endDate: '2026-03-20T00:00:00Z', hideFeedbackAfterDue: true };

  it('hides for students while the quiz is open', () => {
    expect(shouldHideFeedbackForStudent(open, 'STUDENT', now)).toBe(true);
  });
  it('shows once the quiz has closed', () => {
    expect(shouldHideFeedbackForStudent(open, 'STUDENT', new Date('2026-03-21T00:00:00Z'))).toBe(false);
  });
  it('shows when the setting is off or there is no end date', () => {
    expect(shouldHideFeedbackForStudent({ ...open, hideFeedbackAfterDue: false }, 'STUDENT', now)).toBe(false);
    expect(shouldHideFeedbackForStudent({ ...open, endDate: null }, 'STUDENT', now)).toBe(false);
  });
  it('never hides for teaching staff', () => {
    expect(shouldHideFeedbackForStudent(open, 'PROFESSOR', now)).toBe(false);
    expect(shouldHideFeedbackForStudent(open, 'ADMIN', now)).toBe(false);
  });
});
