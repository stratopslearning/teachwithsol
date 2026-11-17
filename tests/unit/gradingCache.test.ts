/**
 * Answer-cache key stability tests.
 *
 * The cache key must:
 *   - be stable across cosmetic whitespace/punctuation differences
 *   - change when any of (questionId | rubricVersion | modelVersion) change
 * Without these invariants, "same answer same score" cannot hold.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/db', () => ({
  db: {
    query: { gradingCache: { findFirst: async () => null } },
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
  },
}));

import {
  computeCacheKey,
  normalizeAnswerForCache,
} from '@/lib/grading/cache';

describe('normalizeAnswerForCache', () => {
  it('lowercases', () => {
    expect(normalizeAnswerForCache('Hello World')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(normalizeAnswerForCache('hello   world')).toBe('hello world');
    expect(normalizeAnswerForCache('hello\tworld')).toBe('hello world');
    expect(normalizeAnswerForCache('hello\nworld')).toBe('hello world');
  });

  it('strips trailing punctuation', () => {
    expect(normalizeAnswerForCache('hello world.')).toBe('hello world');
    expect(normalizeAnswerForCache('hello world!!!')).toBe('hello world');
    expect(normalizeAnswerForCache('hello world. ')).toBe('hello world');
    expect(normalizeAnswerForCache('hello world?')).toBe('hello world');
  });

  it('keeps interior punctuation', () => {
    expect(normalizeAnswerForCache('quality, cost, and time')).toBe(
      'quality, cost, and time',
    );
  });
});

describe('computeCacheKey', () => {
  const base = {
    questionId: '11111111-1111-1111-1111-111111111111',
    studentAnswer: 'Long-term supplier relationships drive cost savings.',
    rubricVersion: 1,
    modelVersion: 'gpt-5-mini-2025-08-07',
  };

  it('produces the same key for cosmetically-different inputs', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({
      ...base,
      studentAnswer: '  Long-term  supplier   relationships drive cost savings.   ',
    });
    expect(a).toBe(b);
  });

  it('produces the same key regardless of case', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({
      ...base,
      studentAnswer: 'LONG-TERM SUPPLIER RELATIONSHIPS DRIVE COST SAVINGS.',
    });
    expect(a).toBe(b);
  });

  it('invalidates when rubricVersion changes', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({ ...base, rubricVersion: 2 });
    expect(a).not.toBe(b);
  });

  it('invalidates when modelVersion changes', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({ ...base, modelVersion: 'gpt-6-future' });
    expect(a).not.toBe(b);
  });

  it('invalidates when SCORING_VERSION changes', async () => {
    const { SCORING_VERSION } = await import('@/lib/grading/cache');
    expect(SCORING_VERSION).toBeGreaterThan(1);
  });

  it('invalidates when questionId changes (no cross-question collisions)', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({
      ...base,
      questionId: '22222222-2222-2222-2222-222222222222',
    });
    expect(a).not.toBe(b);
  });

  it('invalidates when materialsContextHash changes', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({
      ...base,
      materialsContextHash: 'abcdef0123456789',
    });
    expect(a).not.toBe(b);
  });

  it('invalidates when tenantId changes', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({
      ...base,
      tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    expect(a).not.toBe(b);
  });

  it('changes key when tenant and materials hash both set', () => {
    const tenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const a = computeCacheKey({
      ...base,
      tenantId: tenant,
      materialsContextHash: '1111111111111111',
    });
    const b = computeCacheKey({
      ...base,
      tenantId: tenant,
      materialsContextHash: '2222222222222222',
    });
    expect(a).not.toBe(b);
  });

  it('treats missing materialsContextHash as empty', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({ ...base, materialsContextHash: '' });
    expect(a).toBe(b);
  });

  it('produces deterministic 64-char hex digests', () => {
    const key = computeCacheKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(computeCacheKey(base)).toBe(key);
  });
});
