/**
 * Load-test impersonation helpers. Edge-safe (no DB).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LOAD_TEST_SECRET_HEADER,
  LOAD_TEST_USER_HEADER,
  isLoadTestRuntimeAllowed,
  isLoadTestRequest,
  readLoadTestUserId,
} from '@/lib/loadTestAuth';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECRET = 'load-test-secret-16';

function headersWith(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('LOAD_TEST_SECRET', SECRET);
  vi.stubEnv('VERCEL_ENV', 'preview');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadTestAuth', () => {
  it('is disabled when VERCEL_ENV is production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isLoadTestRuntimeAllowed()).toBe(false);
    expect(
      readLoadTestUserId(
        headersWith({
          [LOAD_TEST_SECRET_HEADER]: SECRET,
          [LOAD_TEST_USER_HEADER]: USER_ID,
        }),
      ),
    ).toBeNull();
  });

  it('is disabled on a production build off Vercel', () => {
    delete process.env.VERCEL_ENV;
    vi.stubEnv('NODE_ENV', 'production');
    expect(isLoadTestRuntimeAllowed()).toBe(false);
  });

  it('is disabled for unknown VERCEL_ENV values', () => {
    vi.stubEnv('VERCEL_ENV', 'staging-typo');
    expect(isLoadTestRuntimeAllowed()).toBe(false);
  });

  it('is allowed on Vercel preview even though NODE_ENV is production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production');
    expect(isLoadTestRuntimeAllowed()).toBe(true);
  });

  it('is allowed locally when VERCEL_ENV is unset', () => {
    vi.stubEnv('VERCEL_ENV', undefined as unknown as string);
    delete process.env.VERCEL_ENV;
    expect(isLoadTestRuntimeAllowed()).toBe(true);
  });

  it('returns the user id when secret and uuid match', () => {
    expect(
      readLoadTestUserId(
        headersWith({
          [LOAD_TEST_SECRET_HEADER]: SECRET,
          [LOAD_TEST_USER_HEADER]: USER_ID,
        }),
      ),
    ).toBe(USER_ID);
    expect(
      isLoadTestRequest(
        headersWith({
          [LOAD_TEST_SECRET_HEADER]: SECRET,
          [LOAD_TEST_USER_HEADER]: USER_ID,
        }),
      ),
    ).toBe(true);
  });

  it('rejects a wrong secret, short secret, or non-uuid user id', () => {
    expect(
      readLoadTestUserId(
        headersWith({
          [LOAD_TEST_SECRET_HEADER]: 'wrong-secret-xxxx',
          [LOAD_TEST_USER_HEADER]: USER_ID,
        }),
      ),
    ).toBeNull();
    expect(
      readLoadTestUserId(
        headersWith({
          [LOAD_TEST_SECRET_HEADER]: SECRET,
          [LOAD_TEST_USER_HEADER]: 'not-a-uuid',
        }),
      ),
    ).toBeNull();

    vi.stubEnv('LOAD_TEST_SECRET', 'short');
    expect(
      readLoadTestUserId(
        headersWith({
          [LOAD_TEST_SECRET_HEADER]: 'short',
          [LOAD_TEST_USER_HEADER]: USER_ID,
        }),
      ),
    ).toBeNull();
  });
});
