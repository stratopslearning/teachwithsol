import { describe, expect, it } from 'vitest';

import {
  mergeAttemptAnswers,
  shouldForceAutoSubmitInProgress,
} from '@/lib/quiz/forceAutoSubmit';

describe('shouldForceAutoSubmitInProgress', () => {
  const startedAt = new Date('2026-01-01T12:00:00.000Z');

  it('forces submit when quiz end date has passed', () => {
    const result = shouldForceAutoSubmitInProgress({
      quiz: { endDate: '2026-01-01T13:00:00.000Z', timeLimit: 60 },
      assignment: { dueDate: null },
      startedAt,
      now: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(result).toEqual({ force: true, reason: 'dueDate' });
  });

  it('forces submit when nominal timer hits zero', () => {
    const result = shouldForceAutoSubmitInProgress({
      quiz: { endDate: null, timeLimit: 30 },
      assignment: { dueDate: null },
      startedAt,
      now: new Date(startedAt.getTime() + 30 * 60 * 1000),
    });
    expect(result).toEqual({ force: true, reason: 'timer' });
  });

  it('does not force submit while timer and window are open', () => {
    const result = shouldForceAutoSubmitInProgress({
      quiz: { endDate: '2026-12-31T00:00:00.000Z', timeLimit: 30 },
      assignment: { dueDate: null },
      startedAt,
      now: new Date(startedAt.getTime() + 10 * 60 * 1000),
    });
    expect(result).toEqual({ force: false });
  });
});

describe('mergeAttemptAnswers', () => {
  it('merges saved and incoming answers with incoming winning', () => {
    expect(
      mergeAttemptAnswers({ q1: 'saved' }, { q2: 'new', q1: 'updated' }),
    ).toEqual({ q1: 'updated', q2: 'new' });
  });
});
