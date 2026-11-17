/**
 * Dual authentication for the MCP endpoint (`/api/mcp`).
 *
 * Two bearer flavors are accepted:
 *   1. `sol_pat_…` personal access tokens minted on the Agent Access page
 *      (Cursor, Claude Code, any client with a headers field).
 *   2. Clerk OAuth 2.1 access tokens obtained by browser-based connectors
 *      (Claude.ai, ChatGPT) after the professor completes the Clerk OAuth
 *      flow advertised via `/.well-known/oauth-protected-resource`.
 *
 * OAuth callers get the full professor scope set: the professor proved who
 * they are in a browser, exactly like a dashboard session. Least-privilege
 * access remains available through scoped PATs.
 */
import { auth } from '@clerk/nextjs/server';

import type { ProfessorApiAuth } from '@/lib/api/professorAuth';
import { extractBearerToken } from '@/lib/api/professorAuth';
import { userCanAccessTeachingArea } from '@/lib/authz/gates';
import { effectiveScopesForUser } from '@/lib/authz/tokenScopes';
import { BASE_PATH } from '@/lib/basePath';
import { getOrCreateUserByClerkId } from '@/lib/getOrCreateUser';
import {
  looksLikeApiToken,
  TOKEN_SCOPES,
  verifyProfessorApiToken,
} from '@/lib/professor/apiTokens';

export type McpAuthResult =
  | { ok: true; auth: ProfessorApiAuth }
  | { ok: false; status: 401 | 403; message: string };

/** Resolve the public origin (scheme + host) the MCP endpoint is served on. */
export function resolvePublicOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  return new URL(req.url).origin;
}

/** Canonical MCP resource identifier, e.g. https://host/learning/api/mcp */
export function mcpResourceUrl(origin: string): string {
  return `${origin}${BASE_PATH}/api/mcp`;
}

/**
 * RFC 9728 protected-resource metadata URL for the MCP resource. Served at
 * the site apex (path-insertion form) and rewritten into the app's basePath.
 */
export function mcpResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${BASE_PATH}/api/mcp`;
}

/**
 * `WWW-Authenticate` challenge for 401s. The `resource_metadata` parameter is
 * what tells Claude.ai / ChatGPT where to discover the Clerk authorization
 * server and start the OAuth flow instead of failing silently.
 */
export function mcpWwwAuthenticate(origin: string): string {
  return `Bearer realm="SOL MCP", resource_metadata="${mcpResourceMetadataUrl(origin)}"`;
}

export async function authenticateMcpRequest(
  req: Request,
): Promise<McpAuthResult> {
  const bearer = extractBearerToken(req);
  if (!bearer) {
    return {
      ok: false,
      status: 401,
      message:
        'Missing access token. Connect via OAuth (Claude.ai / ChatGPT) or send a personal access token as "Authorization: Bearer sol_pat_…".',
    };
  }

  if (looksLikeApiToken(bearer)) {
    const verified = await verifyProfessorApiToken(bearer);
    if (!verified) {
      return {
        ok: false,
        status: 401,
        message:
          'Invalid or revoked access token. Mint a new one on the SOL Agent Access page.',
      };
    }
    // Effective scopes = token scopes ∩ owner's bindings in the token tenant.
    // (An empty token scope list is NOT widened to "all" any more.)
    const scopes = await effectiveScopesForUser(
      verified.user.id,
      verified.scopes,
      verified.tenantId,
    );
    return {
      ok: true,
      auth: {
        user: verified.user,
        viaToken: true,
        tokenId: verified.tokenId,
        scopes,
      },
    };
  }

  // Anything else is treated as a Clerk OAuth access token. clerkMiddleware
  // runs on /api/mcp (it only skips the login redirect), so auth() has the
  // request context it needs to verify machine tokens.
  const oauth = await auth({ acceptsToken: 'oauth_token' });
  if (!oauth.isAuthenticated || !oauth.userId) {
    return {
      ok: false,
      status: 401,
      message: 'Invalid or expired OAuth access token. Reconnect the SOL connector to sign in again.',
    };
  }

  const user = await getOrCreateUserByClerkId(oauth.userId);
  if (!user) {
    return {
      ok: false,
      status: 401,
      message: 'Could not resolve the SOL account for this OAuth token.',
    };
  }
  if (!(await userCanAccessTeachingArea(user.id))) {
    return {
      ok: false,
      status: 403,
      message: 'The SOL MCP server requires a teaching role binding.',
    };
  }
  // Connector scopes are capped by the user's bindings across tenants.
  const oauthScopes = await effectiveScopesForUser(user.id, TOKEN_SCOPES);

  return {
    ok: true,
    auth: {
      user,
      viaToken: false,
      viaOAuth: true,
      tokenId: null,
      scopes: oauthScopes,
    },
  };
}
