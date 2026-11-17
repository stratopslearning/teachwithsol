/**
 * Route registry: which paths are public, which authenticate without a
 * browser cookie, and which accept large uploads. Read by middleware.ts and
 * lib/api/sameOrigin.ts so each path is listed exactly once.
 *
 * Edge-safe: no imports. A listed path matches itself and everything below
 * it ("/api/cron" matches "/api/cron" and "/api/cron/grade-pending").
 */

/** Prefix of professor personal access tokens (`Bearer sol_pat_...`). */
export const TOKEN_PREFIX = 'sol_pat_';

export function hasApiTokenHeader(authHeader: string | null | undefined): boolean {
  return Boolean(authHeader?.startsWith(`Bearer ${TOKEN_PREFIX}`));
}

export function matchesPath(appPath: string, paths: readonly string[]): boolean {
  return paths.some((p) => appPath === p || appPath.startsWith(`${p}/`));
}

/**
 * API paths called by machines, not browsers. They authenticate inside the
 * handler (signature, CRON_SECRET, OAuth / PAT bearer, LTI JWT), so they are
 * exempt from the same-origin check and from the edge login redirect.
 */
export const MACHINE_API_PATHS = [
  '/api/stripe/webhook',
  '/api/clerk/webhook',
  '/api/cron',
  '/api/mcp',
  // Canvas LTI OIDC form_post + tool JWKS (no browser cookie session yet).
  '/api/lti',
  // Inngest Dev Server / Cloud (signed requests).
  '/api/inngest',
] as const;

/** Browser API paths reachable without a session (handlers check the rest). */
export const PUBLIC_API_PATHS = ['/api/user', '/api/stripe/product', '/api/demo-request'] as const;

/** Pages (and file routes) that render without a session. '/' is exact-only. */
export const PUBLIC_PAGE_PATHS = [
  // File-based metadata routes (extensionless, so not skipped by the matcher).
  '/apple-icon',
  '/icon',
  '/opengraph-image',
  '/twitter-image',
  '/docs',
  '/docs.md',
  '/blog',
  '/blog.md',
  '/privacy',
  '/terms',
  '/security',
  '/dmca',
  '/unsubscribe',
  '/llms.txt',
  '/robots.txt',
  '/sitemap.xml',
  '/login',
  '/signup',
  // Workspace owner claim: page shows a sign-in CTA; POST still needs a session.
  '/workspaces/claim',
  '/lti/bridge',
  // OAuth discovery metadata (RFC 8414 / 9728), read before anyone signs in.
  '/well-known',
] as const;

export function isPublicPath(appPath: string): boolean {
  return (
    appPath === '/' ||
    matchesPath(appPath, PUBLIC_PAGE_PATHS) ||
    matchesPath(appPath, PUBLIC_API_PATHS) ||
    matchesPath(appPath, MACHINE_API_PATHS)
  );
}

/** Multipart upload routes allowed up to the materials (zip) budget. */
export const LARGE_UPLOAD_API_PATHS = [
  '/api/professor/materials',
  '/api/professor/knowledge/documents',
  '/api/professor/interactive/import',
] as const;

/** Book EPUB/XML upload routes allowed up to the book budget. */
export const BOOK_UPLOAD_API_PATHS = ['/api/professor/books'] as const;
