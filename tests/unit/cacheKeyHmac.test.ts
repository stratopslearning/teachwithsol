import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/db', () => ({ db: {} }));

import { hashCacheKey } from '@/lib/crypto/cacheKeyHmac';
import { computeCacheKey } from '@/lib/grading/cache';

const args = {
  questionId: 'q', studentAnswer: 'True', rubricVersion: 1, modelVersion: 'm',
  tenantId: 't', materialsContextHash: 'h',
};

describe('cache key HMAC (opt-in)', () => {
  afterEach(() => {
    delete process.env.CACHE_KEY_HMAC_SECRET;
  });

  it('is plain SHA-256 when the secret is unset (legacy-stable)', () => {
    const k = hashCacheKey('abc');
    expect(k).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('differs per secret and from legacy when set', () => {
    const legacy = computeCacheKey(args);
    process.env.CACHE_KEY_HMAC_SECRET = 's1';
    const a = computeCacheKey(args);
    process.env.CACHE_KEY_HMAC_SECRET = 's2';
    const b = computeCacheKey(args);
    expect(new Set([legacy, a, b]).size).toBe(3);
  });

  it('keeps tenant separation under HMAC', () => {
    process.env.CACHE_KEY_HMAC_SECRET = 's1';
    expect(computeCacheKey(args)).not.toBe(computeCacheKey({ ...args, tenantId: 'other' }));
  });
});
