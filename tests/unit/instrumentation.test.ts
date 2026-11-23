import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ assert: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({ captureRequestError: vi.fn() }));
vi.mock('../../sentry.server.config', () => ({}));
vi.mock('../../lib/env', () => ({ env: () => ({}) }));
vi.mock('../../lib/db/assertRuntimeRole', () => {
  class RuntimeRoleError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'RuntimeRoleError';
    }
  }
  return { assertRuntimeRole: m.assert, RuntimeRoleError };
});

import { register } from '../../instrumentation';

beforeEach(() => {
  m.assert.mockReset();
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.stubEnv('NODE_ENV', 'production');
});

describe('instrumentation register()', () => {
  it('does not fail boot when the database is unreachable (500s on every request, 2026-11-20)', async () => {
    m.assert.mockRejectedValue(new TypeError('fetch failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(register()).resolves.toBeUndefined();
    expect(m.assert).toHaveBeenCalledTimes(3);
  });

  it('recovers when a retry reaches the database', async () => {
    m.assert
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue({ ok: true, currentUser: 'sol_app', rolbypassrls: false });
    await expect(register()).resolves.toBeUndefined();
    expect(m.assert).toHaveBeenCalledTimes(2);
  });

  it('still refuses to boot with an unsafe role', async () => {
    m.assert.mockResolvedValue({ ok: false, currentUser: 'neondb_owner', reason: 'role can bypass RLS' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(register()).rejects.toThrow('role can bypass RLS');
  });
});
