import { describe, expect, it } from 'vitest';

import { effectiveQuizCloseDate } from '@/lib/quiz/availability';

describe('effectiveQuizCloseDate', () => {
  it('prefers the quiz end date', () => {
    expect(
      effectiveQuizCloseDate(
        { endDate: '2026-05-02T00:00:00Z' },
        { dueDate: '2026-05-01T00:00:00Z' },
      )?.toISOString(),
    ).toBe('2026-05-02T00:00:00.000Z');
  });

  it('falls back to the assignment due date (what the server enforces)', () => {
    expect(
      effectiveQuizCloseDate({ endDate: null }, { dueDate: '2026-05-01T00:00:00Z' })?.toISOString(),
    ).toBe('2026-05-01T00:00:00.000Z');
  });

  it('is null when neither is set', () => {
    expect(effectiveQuizCloseDate({ endDate: null }, { dueDate: null })).toBeNull();
  });
});
