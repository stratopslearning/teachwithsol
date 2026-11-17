/**
 * Submit scoring: MCQ stays in-process, cache hits grade inline, unique
 * short answers go pending without OpenAI / rubric derivation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookupCachedGrading: vi.fn(),
  gradeMultipleQuestions: vi.fn(),
  getOrDeriveRubric: vi.fn(),
}));

vi.mock('@/app/db', () => ({
  db: {
    query: { gradingCache: { findFirst: async () => null } },
    insert: () => ({
      values: () => ({ onConflictDoNothing: async () => undefined }),
    }),
  },
}));

vi.mock('@/lib/grading/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grading/cache')>();
  return { ...actual, lookupCachedGrading: mocks.lookupCachedGrading };
});

vi.mock('@/lib/grading', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grading')>();
  return { ...actual, gradeMultipleQuestions: mocks.gradeMultipleQuestions };
});

vi.mock('@/lib/grading/rubric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grading/rubric')>();
  return { ...actual, getOrDeriveRubric: mocks.getOrDeriveRubric };
});

import { gradeMultipleQuestions } from '@/lib/grading';
import { getOrDeriveRubric } from '@/lib/grading/rubric';
import { scoreSubmittedQuestions } from '@/lib/grading/scoreSubmittedQuestions';
import { GRADING_MODEL_VERSION } from '@/lib/grading/types';

const rubric = [
  { id: 'c1', description: 'Mentions long-term supplier relationships', weight: 1 },
];

beforeEach(() => {
  mocks.lookupCachedGrading.mockReset();
  mocks.gradeMultipleQuestions.mockReset();
  mocks.getOrDeriveRubric.mockReset();
  mocks.lookupCachedGrading.mockResolvedValue(null);
});

describe('scoreSubmittedQuestions', () => {
  it('scores MCQ-only in process and never calls OpenAI or rubric derivation', async () => {
    const result = await scoreSubmittedQuestions(
      [
        {
          id: 'q-mcq',
          type: 'MULTIPLE_CHOICE',
          question: 'Pick A',
          correctAnswer: 'A',
          points: 2,
          rubric: null,
          rubricVersion: 1,
        },
        {
          id: 'q-tf',
          type: 'TRUE_FALSE',
          question: 'True?',
          correctAnswer: 'true',
          points: 1,
          rubric: null,
          rubricVersion: 1,
        },
      ],
      { 'q-mcq': 'A', 'q-tf': 'false' },
    );

    expect(result.totalScore).toBe(2);
    expect(result.maxScore).toBe(3);
    expect(result.pendingQuestionIds).toEqual([]);
    expect(result.gptFeedback).toEqual({});
    expect(gradeMultipleQuestions).not.toHaveBeenCalled();
    expect(getOrDeriveRubric).not.toHaveBeenCalled();
    expect(mocks.lookupCachedGrading).not.toHaveBeenCalled();
  });

  it('grades a short-answer cache hit inline', async () => {
    mocks.lookupCachedGrading.mockResolvedValue({
      score: 3,
      feedback: 'Matched the criterion.',
      confidence: 90,
      maxPoints: 4,
      rubric,
      rubricMatches: [{ criterionId: 'c1', matched: true }],
      modelVersion: GRADING_MODEL_VERSION,
      rubricVersion: 1,
    });

    const result = await scoreSubmittedQuestions(
      [
        {
          id: 'q-sa',
          type: 'SHORT_ANSWER',
          question: 'Explain suppliers.',
          correctAnswer: 'Long-term supplier relationships.',
          points: 4,
          rubric,
          rubricVersion: 1,
        },
      ],
      { 'q-sa': 'Long-term supplier relationships drive savings.' },
    );

    expect(result.pendingQuestionIds).toEqual([]);
    expect(result.totalScore).toBe(3);
    expect(result.maxScore).toBe(4);
    expect(result.gptFeedback['q-sa']?.status).toBe('graded');
    expect(result.gptFeedback['q-sa']?.score).toBe(3);
    expect(result.gptFeedback['q-sa']?.cached).toBe(true);
    expect(gradeMultipleQuestions).not.toHaveBeenCalled();
    expect(getOrDeriveRubric).not.toHaveBeenCalled();
  });

  it('marks unique short answers pending without calling OpenAI', async () => {
    mocks.lookupCachedGrading.mockResolvedValue(null);

    const result = await scoreSubmittedQuestions(
      [
        {
          id: 'q-sa',
          type: 'SHORT_ANSWER',
          question: 'Explain suppliers.',
          correctAnswer: 'Long-term supplier relationships.',
          points: 4,
          rubric,
          rubricVersion: 1,
        },
      ],
      { 'q-sa': 'A brand new unique answer.' },
    );

    expect(result.pendingQuestionIds).toEqual(['q-sa']);
    expect(result.totalScore).toBe(0);
    expect(result.maxScore).toBe(0);
    expect(result.gptFeedback['q-sa']?.status).toBe('pending');
    expect(result.gptFeedback['q-sa']?.score).toBeNull();
    expect(gradeMultipleQuestions).not.toHaveBeenCalled();
    expect(getOrDeriveRubric).not.toHaveBeenCalled();
  });

  it('does not look up the cache when the question has no stored rubric', async () => {
    const result = await scoreSubmittedQuestions(
      [
        {
          id: 'q-sa',
          type: 'SHORT_ANSWER',
          question: 'Explain suppliers.',
          correctAnswer: 'Long-term supplier relationships.',
          points: 4,
          rubric: null,
          rubricVersion: 1,
        },
      ],
      { 'q-sa': 'Something original.' },
    );

    expect(result.pendingQuestionIds).toEqual(['q-sa']);
    expect(mocks.lookupCachedGrading).not.toHaveBeenCalled();
    expect(gradeMultipleQuestions).not.toHaveBeenCalled();
    expect(getOrDeriveRubric).not.toHaveBeenCalled();
  });
});
