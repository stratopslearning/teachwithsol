/**
 * Professor personal access tokens (PATs) for the professor REST API and the
 * MCP server.
 *
 * Format: `sol_pat_<40 hex chars>`. Only the SHA-256 hash is persisted; the
 * plaintext is returned exactly once at mint time. Tokens are tenant-scoped
 * (tenant_id NOT NULL). Lookup under FORCE RLS uses SECURITY DEFINER
 * resolve_api_token(hash); later reads run under the returned tenant (withTenant).
 */
import { createHash, randomBytes } from 'crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { professorApiTokens, users } from '@/app/db/schema';
import { withTenant } from '@/lib/db/tenantContext';
import { findInUserTenants, readInUserTenants } from '@/lib/db/userTenants';
import { toUserData, type UserData } from '@/lib/getOrCreateUser';

export const TOKEN_PREFIX = 'sol_pat_';

export const TOKEN_SCOPES = [
  'read',
  'sections:write',
  'quizzes:write',
  'grades:write',
  'discussions:write',
  'materials:write',
  'authoring:write',
] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** Conservative default for newly minted tokens: read + quiz authoring. */
export const DEFAULT_TOKEN_SCOPES: TokenScope[] = ['read', 'quizzes:write'];

export function isTokenScope(value: string): value is TokenScope {
  return (TOKEN_SCOPES as readonly string[]).includes(value);
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function generateTokenSecret(): string {
  return `${TOKEN_PREFIX}${randomBytes(20).toString('hex')}`;
}

export function looksLikeApiToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(TOKEN_PREFIX);
}

export interface MintedToken {
  id: string;
  name: string;
  /** Plaintext secret: shown once, never stored. */
  token: string;
  prefix: string;
  scopes: TokenScope[];
  tenantId: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export async function mintProfessorApiToken(opts: {
  userId: string;
  /** Active workspace / tenant root — required. */
  tenantId: string;
  name: string;
  scopes: TokenScope[];
  expiresAt?: Date | null;
}): Promise<MintedToken> {
  if (!opts.tenantId) {
    throw new Error('mintProfessorApiToken requires tenantId from the active workspace');
  }
  const secret = generateTokenSecret();
  // FORCE RLS: write under the token's tenant (a plain insert is rejected).
  const [row] = await withTenant(opts.tenantId, opts.userId, (tx) =>
    tx
      .insert(professorApiTokens)
      .values({
        userId: opts.userId,
        tenantId: opts.tenantId,
        name: opts.name,
        tokenHash: hashToken(secret),
        prefix: secret.slice(0, TOKEN_PREFIX.length + 4),
        scopes: opts.scopes,
        expiresAt: opts.expiresAt ?? null,
      })
      .returning(),
  );

  return {
    id: row.id,
    name: row.name,
    token: secret,
    prefix: row.prefix,
    scopes: opts.scopes,
    tenantId: row.tenantId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export interface TokenListItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  tenantId: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export async function listProfessorApiTokens(
  userId: string,
): Promise<TokenListItem[]> {
  // FORCE RLS: a plain db read returns no tokens; read each of the user's
  // tenants, newest first.
  const found = await readInUserTenants(userId, (tx) =>
    tx.query.professorApiTokens.findMany({
      where: eq(professorApiTokens.userId, userId),
    }),
  );
  const rows = found.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    tenantId: row.tenantId,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  }));
}

/** Tombstone the token. Returns false when it doesn't exist / isn't yours. */
export async function revokeProfessorApiToken(opts: {
  userId: string;
  tokenId: string;
}): Promise<boolean> {
  // FORCE RLS: a plain update matches nothing (revoke always "not found").
  // Try each of the user's tenants; the token lives in exactly one.
  const updated = await findInUserTenants(opts.userId, async (tx) => {
    const [row] = await tx
      .update(professorApiTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(professorApiTokens.id, opts.tokenId),
          eq(professorApiTokens.userId, opts.userId),
          isNull(professorApiTokens.revokedAt),
        ),
      )
      .returning({ id: professorApiTokens.id });
    return row;
  });
  return Boolean(updated);
}

export interface VerifiedToken {
  tokenId: string;
  scopes: TokenScope[];
  tenantId: string;
  user: UserData;
}

type ResolveApiTokenRow = {
  token_id: string;
  user_id: string;
  tenant_id: string;
  scopes: unknown;
  revoked_at: Date | string | null;
  expires_at: Date | string | null;
};

/**
 * Resolve a plaintext bearer token via SECURITY DEFINER resolve_api_token.
 * Caller must set app.tenant_id from the returned tenantId before further queries.
 */
export async function verifyProfessorApiToken(
  plaintext: string,
): Promise<VerifiedToken | null> {
  if (!looksLikeApiToken(plaintext)) return null;

  const hashed = hashToken(plaintext);
  const resolved = await db.execute(sql`
    SELECT * FROM resolve_api_token(${hashed})
  `);
  const row = ((resolved as unknown as { rows?: ResolveApiTokenRow[] }).rows?.[0]
    ?? (Array.isArray(resolved) ? (resolved as unknown as ResolveApiTokenRow[])[0] : undefined)) as
    | ResolveApiTokenRow
    | undefined;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;

  const owner = await db.query.users.findFirst({
    where: eq(users.id, row.user_id),
  });
  if (!owner) return null;

  // Under the token's tenant: a plain update matched no rows under FORCE RLS.
  withTenant(row.tenant_id, row.user_id, (tx) =>
    tx
      .update(professorApiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(professorApiTokens.id, row.token_id)),
  ).catch((err) => console.error('PAT lastUsedAt update failed:', err));

  const rawScopes = Array.isArray(row.scopes)
    ? row.scopes
    : typeof row.scopes === 'string'
      ? (JSON.parse(row.scopes) as unknown[])
      : [];
  const scopes = rawScopes.filter(
    (s): s is TokenScope => typeof s === 'string' && isTokenScope(s),
  );

  return {
    tokenId: row.token_id,
    scopes,
    tenantId: row.tenant_id,
    user: toUserData(owner),
  };
}
