/**
 * Staging/dev-only impersonation for k6 load tests.
 *
 * Enabled only when:
 *   - the runtime is a Vercel preview/development deploy, or a non-Vercel
 *     process that isn't a production build (local dev, tests). A production
 *     build off Vercel (VERCEL_ENV unset, NODE_ENV=production) is denied.
 *   - `LOAD_TEST_SECRET` is set (min 16 chars)
 *   - request headers match that secret and carry a UUID user id
 *
 * Never auto-creates users. Middleware skips the Clerk login redirect; the
 * Node handler looks the seeded row up by primary key.
 */

export const LOAD_TEST_SECRET_HEADER = 'x-load-test-secret';
export const LOAD_TEST_USER_HEADER = 'x-load-test-user-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIN_SECRET_LENGTH = 16;

export function isLoadTestRuntimeAllowed(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === 'preview' || vercelEnv === 'development';
  return process.env.NODE_ENV !== 'production';
}

export function getLoadTestSecret(): string | undefined {
  const secret = process.env.LOAD_TEST_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return undefined;
  return secret;
}

function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export function readLoadTestUserId(headerBag: Headers): string | null {
  if (!isLoadTestRuntimeAllowed()) return null;
  const expected = getLoadTestSecret();
  if (!expected) return null;
  const provided = headerBag.get(LOAD_TEST_SECRET_HEADER);
  if (!provided || !secretsEqual(provided, expected)) return null;
  const userId = headerBag.get(LOAD_TEST_USER_HEADER);
  if (!userId || !UUID_RE.test(userId)) return null;
  return userId;
}

export function isLoadTestRequest(headerBag: Headers): boolean {
  return readLoadTestUserId(headerBag) !== null;
}
