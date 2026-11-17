import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  isBodyTooLarge,
  isSameOrigin,
  middlewareBodyLimitBytes,
  shouldEnforceSameOrigin,
} from '@/lib/api/sameOrigin';
import { BASE_PATH, withBasePath } from '@/lib/basePath';
import { CAL_BOOKING_URL } from '@/lib/calBooking';
import { hasApiTokenHeader, isPublicPath } from '@/lib/routes';
import { clerkSatelliteProviderProps } from '@/lib/clerkMultiDomain';
import { isLoadTestRequest } from '@/lib/loadTestAuth';
import {
  classifySolHost,
  isDocsPath,
  isMarketingPath,
  isTrustPath,
  solDemoOnly,
  solHostsConfigured,
  solOrigin,
  type SolHostRole,
} from '@/lib/solHosts';

/**
 * Clerk middleware runs on Vercel's Edge runtime. That means we CANNOT import
 * anything that ultimately drags in Node-only modules — `@/app/db` pulls in
 * `ws` and the Neon `Pool` driver, both of which crash the edge bundle at
 * module-load time and produce `MIDDLEWARE_INVOCATION_FAILED` 500s on every
 * request. Keep this file edge-safe and push role/paid enforcement down into
 * the page layouts and API routes via `lib/auth.ts` (`requireAuth`,
 * `requireAdmin`, `requireProfessor`, `requireStudent`).
 */

function redirectWithinApp(path: string, req: Request) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return NextResponse.redirect(new URL(withBasePath(p), req.url));
}

function redirectToSolHost(role: SolHostRole, path: string, search: string) {
  const origin = solOrigin(role);
  if (!origin) return null;
  const url = new URL(`${origin}${path === '/' ? '/' : path}${search}`);
  return NextResponse.redirect(url);
}

/** Which paths each Sol host owns, and where the rest of its traffic goes. */
const HOST_RULES: Record<
  SolHostRole,
  {
    owns: (path: string) => boolean;
    /** Where '/' goes when this host doesn't own it. */
    home: SolHostRole | null;
    /** Hosts checked, in order, for a path this host doesn't own. */
    handOff: SolHostRole[];
    /** Everything else; null = stay on this host. */
    fallback: SolHostRole | null;
  }
> = {
  marketing: { owns: isMarketingPath, home: null, handOff: ['docs', 'trust'], fallback: 'app' },
  docs: { owns: isDocsPath, home: 'marketing', handOff: ['trust', 'marketing'], fallback: 'app' },
  trust: { owns: isTrustPath, home: 'marketing', handOff: ['docs', 'marketing'], fallback: 'app' },
  app: { owns: () => false, home: 'marketing', handOff: ['docs', 'trust'], fallback: null },
};

/**
 * Sol multi-subdomain map (only when BASE_PATH is empty and SOL_* hosts are set).
 * StratOps `/learning` skips this entirely.
 */
function solHostRedirect(req: {
  nextUrl: { pathname: string; search: string };
  headers: { get(name: string): string | null };
}): NextResponse | null {
  if (BASE_PATH || !solHostsConfigured()) return null;

  const hostHeader = req.headers.get('host') ?? '';
  const role = classifySolHost(hostHeader);
  if (!role) return null;

  const path = req.nextUrl.pathname;
  const search = req.nextUrl.search;

  // Shared public probes — allow on any Sol host (rewritten below).
  if (path.startsWith('/.well-known/') || path.startsWith('/well-known/')) {
    return null;
  }

  // APIs stay same-origin on every Sol host. Cross-host redirects break
  // browser fetch() from marketing (www) → app (CORS / Failed to fetch).
  if (path === '/api' || path.startsWith('/api/')) {
    return null;
  }

  // A host serves its own paths; '/' on docs / trust / app goes to the
  // marketing site; other paths go to the host that owns them.
  const rule = HOST_RULES[role];
  if (rule.owns(path)) return null;
  if (path === '/' && rule.home) return redirectToSolHost(rule.home, '/', search);
  for (const other of rule.handOff) {
    if (HOST_RULES[other].owns(path)) return redirectToSolHost(other, path, search);
  }
  return rule.fallback ? redirectToSolHost(rule.fallback, path, search) : null;
  return null;
}

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  const hostGate = solHostRedirect(req);
  if (hostGate) return hostGate;

  // Soft launch: when DEMO_ONLY, send login/signup to Book a demo.
  if (
    solDemoOnly() &&
    (pathname === '/login' ||
      pathname.startsWith('/login/') ||
      pathname === '/signup' ||
      pathname.startsWith('/signup/'))
  ) {
    return NextResponse.redirect(CAL_BOOKING_URL);
  }

  // OAuth discovery (RFC 8414 / RFC 9728) is probed at the site apex
  // (e.g. /.well-known/oauth-protected-resource/learning/api/mcp) and under
  // the basePath. The App Router cannot own a dot-directory (`.well-known`
  // segments are not routable on this Next version), so both public forms
  // are rewritten onto the internal `/well-known/*` routes. Note
  // `nextUrl.pathname` already has the basePath stripped, so both forms
  // present identically here; use a plain URL to avoid NextURL re-adding
  // the basePath on serialization.
  if (pathname.startsWith('/.well-known/')) {
    const rest = pathname.slice('/.well-known/'.length);
    const dest = `${BASE_PATH}/well-known/${rest}${req.nextUrl.search}`;
    return NextResponse.rewrite(new URL(dest, req.url));
  }

  // Recover from accidental double basePath (StratOps only — empty BASE_PATH
  // must not run startsWith("") which matches every pathname).
  if (BASE_PATH) {
    const doubleBase = `${BASE_PATH}${BASE_PATH}`;
    if (pathname.startsWith(doubleBase)) {
      return NextResponse.redirect(
        new URL(`${pathname.slice(BASE_PATH.length)}${req.nextUrl.search}`, req.url),
      );
    }
    if (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`)) {
      const stripped = pathname.slice(BASE_PATH.length) || '/';
      return NextResponse.redirect(
        new URL(`${BASE_PATH}${stripped}${req.nextUrl.search}`, req.url),
      );
    }
  }

  const appPath =
    BASE_PATH &&
    (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`))
      ? pathname.slice(BASE_PATH.length) || '/'
      : pathname;

  // Markdown mirrors for public docs (llmstxt.org): /docs.md and /docs/:slug.md
  if (appPath === '/docs.md' || appPath === '/docs/index.md') {
    return NextResponse.rewrite(
      new URL(`${BASE_PATH}/docs/md/index${req.nextUrl.search}`, req.url),
    );
  }
  const docsMdMatch = appPath.match(/^\/docs\/([^/]+)\.md$/);
  if (docsMdMatch) {
    return NextResponse.rewrite(
      new URL(
        `${BASE_PATH}/docs/md/${docsMdMatch[1]}${req.nextUrl.search}`,
        req.url,
      ),
    );
  }

  // Blog markdown mirrors: /blog.md and /blog/:slug.md
  if (appPath === '/blog.md' || appPath === '/blog/index.md') {
    return NextResponse.rewrite(
      new URL(`${BASE_PATH}/blog/md/index${req.nextUrl.search}`, req.url),
    );
  }
  const blogMdMatch = appPath.match(/^\/blog\/([^/]+)\.md$/);
  if (blogMdMatch) {
    return NextResponse.rewrite(
      new URL(
        `${BASE_PATH}/blog/md/${blogMdMatch[1]}${req.nextUrl.search}`,
        req.url,
      ),
    );
  }

  // Agent access paths authenticate inside the route handler with a personal
  // access token (`sol_pat_…`) instead of a Clerk cookie, so the edge layer
  // must not bounce them to the login page. Every handler on these paths
  // still enforces auth itself (verifyProfessorApiToken / getOrCreateUser).
  const authHeader = req.headers.get('authorization') ?? '';
  const hasApiToken = hasApiTokenHeader(authHeader);
  const loadTest = isLoadTestRequest(req.headers);

  // CSRF: cookie-authenticated mutating /api/* must be same-origin.
  // Bearer PAT / MCP / cron / webhooks / load-test stay exempt.
  if (
    shouldEnforceSameOrigin(req.method, appPath, authHeader || null, loadTest)
  ) {
    if (!isSameOrigin(req)) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'csrf_origin' },
        { status: 403 },
      );
    }
  }

  // Cheap early reject for oversized API bodies (chunked bodies are checked
  // again in readJsonBody / route handlers). Materials/knowledge/H5P 51 MB
  // (zip packs); books 50 MB.
  if (
    appPath.startsWith('/api/') &&
    shouldEnforceSameOrigin(req.method, appPath, authHeader || null, loadTest) &&
    isBodyTooLarge(
      req.headers.get('content-length'),
      middlewareBodyLimitBytes(appPath),
    )
  ) {
    return NextResponse.json(
      { error: 'Payload too large', code: 'payload_too_large' },
      { status: 413 },
    );
  }

  if (hasApiToken && appPath.startsWith('/api/professor/')) return;

  // k6 impersonation: skip the Clerk login redirect. The Node handler still
  // authenticates via x-load-test-* headers in getOrCreateUser. Hard-disabled
  // when VERCEL_ENV=production (see lib/loadTestAuth.ts).
  if (loadTest) return;

  // Public pages, public APIs and machine-called APIs (lib/routes.ts). MCP,
  // cron, webhooks and LTI authenticate inside their handlers.
  if (isPublicPath(appPath)) return;

  const { userId } = await auth();
  if (!userId) {
    // API clients (fetch) must not follow a 307 to /login with the original
    // body — that hits the Server Action 1 MB limit and surfaces as a 500.
    if (appPath.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'unauthorized' },
        { status: 401 },
      );
    }
    return redirectWithinApp('/login', req);
  }
}, clerkSatelliteProviderProps());

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    // Satellite sync / Clerk frontend API proxy paths
    '/(__clerk)(.*)',
  ],
};
