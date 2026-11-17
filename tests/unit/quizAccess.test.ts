import { describe, expect, it } from 'vitest';

import {
  redactAttemptFeedbackForViewer,
  stripQuestionSecrets,
} from '@/lib/quiz/access';

describe('redactAttemptFeedbackForViewer', () => {
  const attempt = {
    score: 8,
    maxScore: 10,
    percentage: 80,
    gptFeedback: { q1: { score: 8, rubric: ['a'] } },
  };

  it('redacts for students before due when hideFeedbackAfterDue is set', () => {
    const quiz = {
      endDate: new Date('2099-01-01T00:00:00.000Z'),
      hideFeedbackAfterDue: true,
    };
    const redacted = redactAttemptFeedbackForViewer(attempt, quiz, 'STUDENT');
    expect(redacted.score).toBeNull();
    expect(redacted.percentage).toBeNull();
    expect(redacted.gptFeedback).toBeNull();
    expect(redacted.maxScore).toBe(10);
  });

  it('does not redact for professors', () => {
    const quiz = {
      endDate: new Date('2099-01-01T00:00:00.000Z'),
      hideFeedbackAfterDue: true,
    };
    expect(redactAttemptFeedbackForViewer(attempt, quiz, 'PROFESSOR')).toEqual(
      attempt,
    );
  });
});

describe('stripQuestionSecrets', () => {
  it('nulls correctAnswer, rubric, and rubricVersion', () => {
    expect(
      stripQuestionSecrets({
        id: 'q1',
        correctAnswer: '42',
        rubric: { criteria: [] },
        rubricVersion: 3,
      }),
    ).toEqual({
      id: 'q1',
      correctAnswer: null,
      rubric: null,
      rubricVersion: null,
    });
  });
});
