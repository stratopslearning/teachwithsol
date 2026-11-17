import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-ins so we can exercise verifyProfessorApiToken without a DB.
const state: {
  tokenRow: Record<string, unknown> | null;
  userRow: Record<string, unknown> | null;
} = { tokenRow: null, userRow: null };

vi.mock('@/app/db', () => ({
  db: {
    query: {
      professorApiTokens: {
        findFirst: async () => state.tokenRow,
        findMany: async () => (state.tokenRow ? [state.tokenRow] : []),
      },
      users: { findFirst: async () => state.userRow },
    },
    // resolve_api_token(...) SECURITY DEFINER function + set_config.
    execute: async () => {
      const t = state.tokenRow;
      if (!t) return { rows: [] };
      return {
        rows: [
          {
            token_id: t.id,
            user_id: t.userId,
            tenant_id: 'tenant-1',
            scopes: t.scopes,
            revoked_at: t.revokedAt,
            expires_at: t.expiresAt,
          },
        ],
      };
    },
    insert: () => ({
      values: () => ({ returning: async () => [state.tokenRow] }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [state.tokenRow],
          catch: () => undefined,
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        }),
      }),
    }),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: null }),
  clerkClient: async () => ({}),
}));

import {
  generateTokenSecret,
  hashToken,
  isTokenScope,
  looksLikeApiToken,
  TOKEN_PREFIX,
  verifyProfessorApiToken,
} from '@/lib/professor/apiTokens';

const baseUser = {
  id: 'user-1',
  clerkId: 'clerk-1',
  email: 'prof@example.edu',
  firstName: 'Pat',
  lastName: 'Professor',
  platformStaff: false,
  paid: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function tokenRowFor(secret: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-1',
    userId: 'user-1',
    name: 'test token',
    tokenHash: hashToken(secret),
    prefix: secret.slice(0, TOKEN_PREFIX.length + 4),
    scopes: ['read', 'quizzes:write'],
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  state.tokenRow = null;
  state.userRow = null;
});

describe('token format helpers', () => {
  it('generates sol_pat_ prefixed 40-hex secrets', () => {
    const secret = generateTokenSecret();
    expect(secret.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(secret.slice(TOKEN_PREFIX.length)).toMatch(/^[0-9a-f]{40}$/);
  });

  it('generates unique secrets', () => {
    expect(generateTokenSecret()).not.toBe(generateTokenSecret());
  });

  it('hashes deterministically (sha256 hex)', () => {
    const secret = generateTokenSecret();
    expect(hashToken(secret)).toBe(hashToken(secret));
    expect(hashToken(secret)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('recognizes token-shaped strings', () => {
    expect(looksLikeApiToken(`${TOKEN_PREFIX}abc`)).toBe(true);
    expect(looksLikeApiToken('Bearer xyz')).toBe(false);
    expect(looksLikeApiToken(null)).toBe(false);
  });

  it('validates scopes', () => {
    expect(isTokenScope('read')).toBe(true);
    expect(isTokenScope('grades:write')).toBe(true);
    expect(isTokenScope('admin:everything')).toBe(false);
  });
});

describe('verifyProfessorApiToken', () => {
  it('resolves a valid token to its owner and scopes', async () => {
    const secret = generateTokenSecret();
    state.tokenRow = tokenRowFor(secret);
    state.userRow = baseUser;

    const verified = await verifyProfessorApiToken(secret);
    expect(verified).not.toBeNull();
    expect(verified!.user.id).toBe('user-1');
    expect(verified!.scopes).toEqual(['read', 'quizzes:write']);
  });

  it('rejects non-token strings without touching the db', async () => {
    expect(await verifyProfessorApiToken('not-a-token')).toBeNull();
  });

  it('rejects revoked tokens', async () => {
    const secret = generateTokenSecret();
    state.tokenRow = tokenRowFor(secret, { revokedAt: new Date() });
    state.userRow = baseUser;
    expect(await verifyProfessorApiToken(secret)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const secret = generateTokenSecret();
    state.tokenRow = tokenRowFor(secret, {
      expiresAt: new Date(Date.now() - 60_000),
    });
    state.userRow = baseUser;
    expect(await verifyProfessorApiToken(secret)).toBeNull();
  });

  it('does not consult users.role: authority comes from bindings (Wave 2 item 14)', async () => {
    const secret = generateTokenSecret();
    state.tokenRow = tokenRowFor(secret);
    state.userRow = { ...baseUser };
    const verified = await verifyProfessorApiToken(secret);
    // Token still resolves; effectiveScopesForUser() later intersects with bindings
    // (a user with no teaching bindings ends up with zero effective scopes).
    expect(verified?.user.id).toBe('user-1');
    expect(verified?.tenantId).toBe('tenant-1');
  });

  it('filters unknown scopes from stored rows', async () => {
    const secret = generateTokenSecret();
    state.tokenRow = tokenRowFor(secret, {
      scopes: ['read', 'bogus:scope'],
    });
    state.userRow = baseUser;
    const verified = await verifyProfessorApiToken(secret);
    expect(verified!.scopes).toEqual(['read']);
  });
});
