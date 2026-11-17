import { describe, expect, it } from 'vitest';

import { computeCacheKey } from '@/lib/grading/cache';

/** Isolation suite guard: grading cache keys must not collide across tenants. */
describe('grading cache tenant isolation (unit)', () => {
  const base = {
    questionId: '11111111-1111-1111-1111-111111111111',
    studentAnswer: 'answer text',
    rubricVersion: 1,
    modelVersion: 'gpt-5-mini-2025-08-07',
  };

  it('produces distinct keys per tenantId', () => {
    const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const keyA = computeCacheKey({ ...base, tenantId: tenantA });
    const keyB = computeCacheKey({ ...base, tenantId: tenantB });
    expect(keyA).not.toBe(keyB);
  });
});
