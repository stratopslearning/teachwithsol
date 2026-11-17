import { describe, expect, it } from 'vitest';

import {
  getQuizAvailability,
  isQuizListedForStudents,
} from '@/lib/quiz/availability';

describe('getQuizAvailability', () => {
  const now = new Date('2026-06-15T18:00:00.000Z');

  it('blocks before start and after quiz endDate', () => {
    expect(
      getQuizAvailability(
        {
          startDate: '2026-06-16T00:00:00.000Z',
          endDate: '2026-06-20T00:00:00.000Z',
        },
        { dueDate: null },
        now,
      ),
    ).toEqual({ allowed: false, reason: 'quizNotStarted' });

    expect(
      getQuizAvailability(
        {
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2026-06-10T00:00:00.000Z',
        },
        { dueDate: null },
        now,
      ),
    ).toEqual({ allowed: false, reason: 'quizEnded' });
  });

  it('closes at the stored UTC instant, not a local clock string', () => {
    const endDate = '2026-09-16T03:59:00.000Z';
    expect(
      getQuizAvailability(
        { startDate: null, endDate },
        { dueDate: null },
        new Date('2026-09-16T03:58:00.000Z'),
      ),
    ).toEqual({ allowed: true });
    expect(
      getQuizAvailability(
        { startDate: null, endDate },
        { dueDate: null },
        new Date('2026-09-16T04:00:00.000Z'),
      ),
    ).toEqual({ allowed: false, reason: 'quizEnded' });
  });

  it('uses assignment dueDate only when quiz endDate is unset', () => {
    expect(
      getQuizAvailability(
        { startDate: null, endDate: null },
        { dueDate: '2026-06-10T00:00:00.000Z' },
        now,
      ),
    ).toEqual({ allowed: false, reason: 'dueDatePassed' });

    expect(
      getQuizAvailability(
        { startDate: null, endDate: '2026-06-20T00:00:00.000Z' },
        { dueDate: '2026-06-10T00:00:00.000Z' },
        now,
      ),
    ).toEqual({ allowed: true });
  });
});

describe('isQuizListedForStudents', () => {
  const now = new Date('2026-06-15T18:00:00.000Z');

  it('hides unpublished, archived, and not-yet-open quizzes', () => {
    expect(
      isQuizListedForStudents({ isActive: false, deletedAt: null, startDate: null }, now),
    ).toBe(false);
    expect(
      isQuizListedForStudents(
        { isActive: true, deletedAt: now, startDate: null },
        now,
      ),
    ).toBe(false);
    expect(
      isQuizListedForStudents(
        {
          isActive: true,
          deletedAt: null,
          startDate: '2026-06-16T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });

  it('lists a published quiz once the start date has arrived', () => {
    expect(
      isQuizListedForStudents(
        {
          isActive: true,
          deletedAt: null,
          startDate: '2026-06-15T18:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
    expect(
      isQuizListedForStudents(
        { isActive: true, deletedAt: null, startDate: null },
        now,
      ),
    ).toBe(true);
  });
});
