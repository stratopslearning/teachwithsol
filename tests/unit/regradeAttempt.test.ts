import { describe, expect, it, vi } from 'vitest';

// Stub the db so we can import lib/regradeAttempt without a live database.
vi.mock('@/app/db', () => ({
  db: {
    query: { gradingCache: { findFirst: async () => null } },
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));

import {
  FALLBACK_FEEDBACK_SNIPPET,
  isFallbackGradingFeedback,
  isPendingFeedback,
} from '@/lib/grading/regradeAttempt';

describe('isFallbackGradingFeedback', () => {
  it('detects the legacy "Grading system temporarily unavailable" message', () => {
    expect(
      isFallbackGradingFeedback({
        score: 0,
        feedback: `${FALLBACK_FEEDBACK_SNIPPET}. Your answer has been recorded.`,
        confidence: 30,
      }),
    ).toBe(true);
  });

  it('returns false for normal AI feedback', () => {
    expect(
      isFallbackGradingFeedback({
        score: 2,
        feedback: 'You correctly identified all four categories.',
        confidence: 85,
        status: 'graded',
      }),
    ).toBe(false);
  });

  it('returns true for new-pipeline pending entries', () => {
    expect(
      isFallbackGradingFeedback({
        score: null,
        feedback: 'Grading is queued.',
        confidence: 0,
        maxPoints: 2,
        status: 'pending',
        failureReason: 'openai_timeout',
      }),
    ).toBe(true);
  });

  it('returns true for manual_review entries', () => {
    expect(
      isFallbackGradingFeedback({
        score: null,
        feedback: 'Awaiting instructor review.',
        confidence: 0,
        maxPoints: 2,
        status: 'manual_review',
      }),
    ).toBe(true);
  });

  it('returns false for non-object inputs', () => {
    expect(isFallbackGradingFeedback(null)).toBe(false);
    expect(isFallbackGradingFeedback(undefined)).toBe(false);
    expect(isFallbackGradingFeedback('string')).toBe(false);
    expect(isFallbackGradingFeedback(42)).toBe(false);
  });
});

describe('isPendingFeedback', () => {
  it('returns true for pending', () => {
    expect(isPendingFeedback({ status: 'pending' })).toBe(true);
  });

  it('returns true for manual_review', () => {
    expect(isPendingFeedback({ status: 'manual_review' })).toBe(true);
  });

  it('returns false for graded', () => {
    expect(isPendingFeedback({ status: 'graded' })).toBe(false);
  });

  it('returns false for legacy entries with no status', () => {
    expect(isPendingFeedback({ score: 2, feedback: 'ok' })).toBe(false);
  });

  it('returns false for non-object inputs', () => {
    expect(isPendingFeedback(null)).toBe(false);
    expect(isPendingFeedback('string')).toBe(false);
  });
});
