import { describe, expect, it } from 'vitest';

import {
  computeQuestionStatsForAttempts,
  parseAttemptJsonRecord,
  type QuizQuestionForStats,
} from '@/lib/quiz/questionStats';

const q1: QuizQuestionForStats = {
  id: '11111111-1111-1111-1111-111111111111',
  order: 1,
  question: 'What is ABC analysis?',
  type: 'SHORT_ANSWER',
  points: 2,
  correctAnswer: 'Classifies inventory by value.',
};

const q2: QuizQuestionForStats = {
  id: '22222222-2222-2222-2222-222222222222',
  order: 2,
  question: 'JIT reduces inventory.',
  type: 'TRUE_FALSE',
  points: 2,
  correctAnswer: 'True',
};

describe('parseAttemptJsonRecord', () => {
  it('parses object jsonb as-is', () => {
    expect(parseAttemptJsonRecord({ [q1.id]: 'answer' })).toEqual({
      [q1.id]: 'answer',
    });
  });

  it('parses JSON string objects', () => {
    expect(
      parseAttemptJsonRecord(JSON.stringify({ [q1.id]: 'answer' })),
    ).toEqual({ [q1.id]: 'answer' });
  });

  it('returns empty object for legacy array payloads', () => {
    expect(
      parseAttemptJsonRecord(
        JSON.stringify([{ questionId: q1.id, isCorrect: true }]),
      ),
    ).toEqual({});
  });
});

describe('computeQuestionStatsForAttempts', () => {
  it('counts short-answer attempts and successes from gpt_feedback', () => {
    const stats = computeQuestionStatsForAttempts([q1], [
      {
        answers: { [q1.id]: 'Students mention ABC tiers.' },
        gptFeedback: {
          [q1.id]: { score: 2, maxPoints: 2, feedback: 'Good', confidence: 90 },
        },
      },
      {
        answers: { [q1.id]: 'Incomplete answer.' },
        gptFeedback: {
          [q1.id]: { score: 1, maxPoints: 2, feedback: 'Partial', confidence: 80 },
        },
      },
    ]);

    expect(stats[0]?.attempts).toBe(2);
    expect(stats[0]?.correctAnswers).toBe(1);
    expect(stats[0]?.successRate).toBe(50);
  });

  it('counts objective questions from answer equality', () => {
    const stats = computeQuestionStatsForAttempts([q2], [
      { answers: { [q2.id]: 'True' }, gptFeedback: {} },
      { answers: { [q2.id]: 'False' }, gptFeedback: {} },
    ]);

    expect(stats[0]?.attempts).toBe(2);
    expect(stats[0]?.correctAnswers).toBe(1);
    expect(stats[0]?.successRate).toBe(50);
  });

  it('ignores unanswered objective questions', () => {
    const stats = computeQuestionStatsForAttempts([q2], [
      { answers: {}, gptFeedback: {} },
    ]);

    expect(stats[0]?.attempts).toBe(0);
    expect(stats[0]?.successRate).toBe(0);
  });
});
