import { describe, expect, it } from 'vitest';

import { QUIZ_LIMITS, quizCreateBaseSchema } from '@/lib/quiz/schemas';

const validQuestion = {
  type: 'TRUE_FALSE' as const,
  question: 'Is the window required?',
  points: 1,
  order: 0,
  correctAnswer: 'true',
};

const base = {
  title: 'Chapter 2',
  sectionIds: ['section-1'],
  maxAttempts: 1,
  passingScore: 60,
  questions: [validQuestion],
};

describe('quizCreateBaseSchema window', () => {
  it('rejects a quiz without start and end dates', () => {
    const result = quizCreateBaseSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it('rejects an end that is not after the start', () => {
    const result = quizCreateBaseSchema.safeParse({
      ...base,
      startDate: '2026-09-02T18:00:00.000Z',
      endDate: '2026-09-02T18:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a quiz with a start before the due date', () => {
    const result = quizCreateBaseSchema.safeParse({
      ...base,
      startDate: '2026-09-01T14:00:00.000Z',
      endDate: '2026-09-08T23:59:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('quizUpdateSchema (shared by professor and admin update)', () => {
  const base = {
    title: 'Quiz',
    sectionIds: ['s1'],
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-08T00:00:00.000Z',
    questions: [{ type: 'TRUE_FALSE', question: 'Q?', correctAnswer: 'True', order: 0 }],
  };

  it('treats null description / time limit (from edit forms) as unset', async () => {
    const { quizUpdateSchema } = await import('@/lib/quiz/schemas');
    const out = quizUpdateSchema.parse({ ...base, description: null, timeLimit: null });
    expect(out.description).toBeUndefined();
    expect(out.timeLimit).toBeUndefined();
    expect(out.isActive).toBe(true);
  });

  it('accepts admin-set attempt limits up to 20, not beyond', async () => {
    const { quizUpdateSchema } = await import('@/lib/quiz/schemas');
    expect(quizUpdateSchema.safeParse({ ...base, maxAttempts: 20 }).success).toBe(true);
    expect(quizUpdateSchema.safeParse({ ...base, maxAttempts: 21 }).success).toBe(false);
  });

  it('rejects an end date before the start date', async () => {
    const { quizUpdateSchema } = await import('@/lib/quiz/schemas');
    const r = quizUpdateSchema.safeParse({ ...base, endDate: '2025-12-01T00:00:00.000Z' });
    expect(r.success).toBe(false);
  });
});

// The quiz forms import QUIZ_LIMITS; these checks keep the server on the same numbers.
describe('QUIZ_LIMITS match the server schema', () => {
  const valid = {
    ...base,
    startDate: '2026-09-01T14:00:00.000Z',
    endDate: '2026-09-02T14:00:00.000Z',
  };
  it('title', () => {
    const ok = 'x'.repeat(QUIZ_LIMITS.titleMax);
    expect(quizCreateBaseSchema.safeParse({ ...valid, title: ok }).success).toBe(true);
    expect(quizCreateBaseSchema.safeParse({ ...valid, title: ok + 'x' }).success).toBe(false);
  });
  it('time limit', () => {
    const max = QUIZ_LIMITS.timeLimitMaxMinutes;
    expect(quizCreateBaseSchema.safeParse({ ...valid, timeLimit: max }).success).toBe(true);
    expect(quizCreateBaseSchema.safeParse({ ...valid, timeLimit: max + 1 }).success).toBe(false);
  });
});
