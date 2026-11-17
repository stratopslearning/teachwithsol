/**
 * Grading path contracts: cache key includes tenant.
 * (Full submit→worker path covered by unit executeQuizSubmit + isolation gradingCache.)
 */
import { describe, expect, it } from 'vitest';

import { computeCacheKey } from '@/lib/grading/cache';

describe('wf.quiz.submit.grade.contract', () => {
  it('grading cache key differs across tenants for same answer payload', () => {
    const base = {
      questionId: 'q1',
      studentAnswer: 'A',
      rubricVersion: 1,
      modelVersion: 'test-model',
    };
    const a = computeCacheKey({ ...base, tenantId: 'tenant-a' });
    const b = computeCacheKey({ ...base, tenantId: 'tenant-b' });
    expect(a).not.toBe(b);
  });
});
