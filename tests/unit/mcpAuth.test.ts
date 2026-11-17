import { beforeEach, describe, expect, it, vi } from 'vitest';

// The mcpAuth module transitively pulls the db (via professorApiTokens and
// getOrCreateUser) and Clerk's server SDK; stub all three so the auth logic
// runs in isolation.
const authMock = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => authMock(...args),
  clerkClient: async () => ({}),
}));

const verifyProfessorApiTokenMock = vi.fn();
vi.mock('@/lib/professor/apiTokens', () => ({
  TOKEN_PREFIX: 'sol_pat_',
  TOKEN_SCOPES: [
    'read',
    'sections:write',
    'quizzes:write',
    'grades:write',
    'discussions:write',
    'materials:write',
    'authoring:write',
  ],
  looksLikeApiToken: (value: unknown) =>
    typeof value === 'string' && value.startsWith('sol_pat_'),
  verifyProfessorApiToken: (...args: unknown[]) =>
    verifyProfessorApiTokenMock(...args),
}));

const getOrCreateUserByClerkIdMock = vi.fn();
vi.mock('@/lib/getOrCreateUser', () => ({
  getOrCreateUserByClerkId: (...args: unknown[]) =>
    getOrCreateUserByClerkIdMock(...args),
  getOrCreateUser: async () => null,
  toUserData: (row: unknown) => row,
}));

// Wave 2 (14): effective scopes = token scopes ∩ role bindings. The binding
// lookup hits the db, so stub it: bindings grant whatever was requested for a
// teaching role and nothing for a student.
let currentRole: 'STUDENT' | 'PROFESSOR' | 'ADMIN' = 'PROFESSOR';
vi.mock('@/lib/authz/tokenScopes', () => ({
  effectiveScopesForUser: async (_userId: string, requested: readonly string[]) =>
    currentRole === 'STUDENT' ? [] : [...requested],
}));
vi.mock('@/lib/authz/gates', () => ({
  userCanAccessTeachingArea: async () => currentRole !== 'STUDENT',
}));

import {
  authenticateMcpRequest,
  mcpResourceMetadataUrl,
  mcpResourceUrl,
  mcpWwwAuthenticate,
} from '@/lib/api/mcpAuth';

function makeUser(role: 'STUDENT' | 'PROFESSOR' | 'ADMIN') {
  currentRole = role;
  return {
    id: 'user-1',
    clerkId: 'clerk-1',
    email: 'prof@example.edu',
    firstName: 'Pat',
    lastName: 'Professor',
    platformStaff: role === 'ADMIN',
    paid: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function requestWithBearer(token?: string): Request {
  return new Request('https://www.strat-ops.net/learning/api/mcp', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  authMock.mockReset();
  verifyProfessorApiTokenMock.mockReset();
  getOrCreateUserByClerkIdMock.mockReset();
});

describe('authenticateMcpRequest — PAT path', () => {
  it('accepts a valid sol_pat_ token with its scopes', async () => {
    verifyProfessorApiTokenMock.mockResolvedValue({
      user: makeUser('PROFESSOR'),
      tokenId: 'token-1',
      scopes: ['read'],
    });

    const result = await authenticateMcpRequest(
      requestWithBearer('sol_pat_abc123'),
    );

    expect(result).toMatchObject({
      ok: true,
      auth: { viaToken: true, tokenId: 'token-1', scopes: ['read'] },
    });
    // PAT path must never hit Clerk.
    expect(authMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid or revoked PAT with 401', async () => {
    verifyProfessorApiTokenMock.mockResolvedValue(null);

    const result = await authenticateMcpRequest(
      requestWithBearer('sol_pat_revoked'),
    );

    expect(result).toMatchObject({ ok: false, status: 401 });
  });
});

describe('authenticateMcpRequest — OAuth path', () => {
  it('accepts a Clerk OAuth token for a professor with full scopes', async () => {
    authMock.mockResolvedValue({
      isAuthenticated: true,
      tokenType: 'oauth_token',
      userId: 'clerk-1',
    });
    getOrCreateUserByClerkIdMock.mockResolvedValue(makeUser('PROFESSOR'));

    const result = await authenticateMcpRequest(
      requestWithBearer('oat_clerk_oauth_token'),
    );

    expect(authMock).toHaveBeenCalledWith({ acceptsToken: 'oauth_token' });
    expect(result).toMatchObject({
      ok: true,
      auth: {
        viaToken: false,
        viaOAuth: true,
        tokenId: null,
        scopes: [
          'read',
          'sections:write',
          'quizzes:write',
          'grades:write',
          'discussions:write',
          'materials:write',
          'authoring:write',
        ],
      },
    });
  });

  it('accepts ADMIN accounts too', async () => {
    authMock.mockResolvedValue({
      isAuthenticated: true,
      tokenType: 'oauth_token',
      userId: 'clerk-1',
    });
    getOrCreateUserByClerkIdMock.mockResolvedValue(makeUser('ADMIN'));

    const result = await authenticateMcpRequest(
      requestWithBearer('oat_clerk_oauth_token'),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a student OAuth session with 403', async () => {
    authMock.mockResolvedValue({
      isAuthenticated: true,
      tokenType: 'oauth_token',
      userId: 'clerk-1',
    });
    getOrCreateUserByClerkIdMock.mockResolvedValue(makeUser('STUDENT'));

    const result = await authenticateMcpRequest(
      requestWithBearer('oat_clerk_oauth_token'),
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects an invalid/expired OAuth token with 401', async () => {
    authMock.mockResolvedValue({ isAuthenticated: false, userId: null });

    const result = await authenticateMcpRequest(
      requestWithBearer('oat_expired'),
    );
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(getOrCreateUserByClerkIdMock).not.toHaveBeenCalled();
  });

  it('rejects when the Clerk user has no SOL account', async () => {
    authMock.mockResolvedValue({
      isAuthenticated: true,
      tokenType: 'oauth_token',
      userId: 'clerk-unknown',
    });
    getOrCreateUserByClerkIdMock.mockResolvedValue(null);

    const result = await authenticateMcpRequest(
      requestWithBearer('oat_clerk_oauth_token'),
    );
    expect(result).toMatchObject({ ok: false, status: 401 });
  });
});

describe('authenticateMcpRequest — no credentials', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const result = await authenticateMcpRequest(requestWithBearer());
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(authMock).not.toHaveBeenCalled();
  });
});

describe('OAuth discovery URLs', () => {
  const origin = 'https://www.strat-ops.net';

  it('pins the resource to the basePath-qualified MCP URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/learning');
    vi.resetModules();
    const mod = await import('@/lib/api/mcpAuth');
    expect(mod.mcpResourceUrl(origin)).toBe(
      'https://www.strat-ops.net/learning/api/mcp',
    );
  });

  it('uses the RFC 9728 path-insertion form for resource metadata', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/learning');
    vi.resetModules();
    const mod = await import('@/lib/api/mcpAuth');
    expect(mod.mcpResourceMetadataUrl(origin)).toBe(
      'https://www.strat-ops.net/.well-known/oauth-protected-resource/learning/api/mcp',
    );
  });

  it('includes the resource_metadata hint in the 401 challenge', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/learning');
    vi.resetModules();
    const mod = await import('@/lib/api/mcpAuth');
    const challenge = mod.mcpWwwAuthenticate(origin);
    expect(challenge).toContain('Bearer');
    expect(challenge).toContain(
      'resource_metadata="https://www.strat-ops.net/.well-known/oauth-protected-resource/learning/api/mcp"',
    );
  });

  it('omits /learning when BASE_PATH is empty (Sol deploy)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    vi.resetModules();
    const mod = await import('@/lib/api/mcpAuth');
    expect(mod.mcpResourceUrl(origin)).toBe(
      'https://www.strat-ops.net/api/mcp',
    );
  });
});
