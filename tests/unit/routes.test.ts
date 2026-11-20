import { describe, expect, it } from 'vitest';

import {
  hasApiTokenHeader,
  isPublicPath,
  matchesPath,
  MACHINE_API_PATHS,
  TOKEN_PREFIX,
} from '@/lib/routes';
import { isOriginExemptPath, middlewareBodyLimitBytes, MIDDLEWARE_MAX_BODY_BYTES } from '@/lib/api/sameOrigin';

describe('route registry', () => {
  it('matches a path and everything below it, not look-alikes', () => {
    expect(matchesPath('/api/cron', ['/api/cron'])).toBe(true);
    expect(matchesPath('/api/cron/grade-pending', ['/api/cron'])).toBe(true);
    expect(matchesPath('/api/cronx', ['/api/cron'])).toBe(false);
  });

  it('keeps every path the old middleware list treated as public', () => {
    for (const p of [
      '/', '/apple-icon', '/icon/32', '/opengraph-image', '/twitter-image',
      '/docs', '/docs/getting-started', '/docs.md', '/blog', '/blog/post', '/blog.md',
      '/privacy', '/terms', '/security', '/dmca', '/unsubscribe', '/api/demo-request',
      '/llms.txt', '/robots.txt', '/sitemap.xml', '/login', '/login/sso', '/signup',
      '/workspaces/claim', '/workspaces/claim/abc', '/api/user', '/api/stripe/product',
      '/api/stripe/webhook', '/api/clerk/webhook', '/api/lti/launch', '/lti/bridge',
      '/api/cron/grade-pending', '/api/inngest', '/api/mcp', '/api/health', '/well-known/oauth-protected-resource',
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
    for (const p of ['/dashboard/professor', '/api/professor/quiz/create', '/quiz/abc']) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it('machine-called APIs are exempt from the same-origin check', () => {
    for (const p of MACHINE_API_PATHS) expect(isOriginExemptPath(`${p}/x`)).toBe(true);
    expect(isOriginExemptPath('/api/professor/quiz/create')).toBe(false);
  });

  it('recognises personal access tokens by the shared prefix', () => {
    expect(hasApiTokenHeader(`Bearer ${TOKEN_PREFIX}abc`)).toBe(true);
    expect(hasApiTokenHeader('Bearer eyJhbGci')).toBe(false);
    expect(hasApiTokenHeader(null)).toBe(false);
  });

  it('upload routes get the larger body budgets', () => {
    expect(middlewareBodyLimitBytes('/api/professor/books/upload')).toBeGreaterThan(MIDDLEWARE_MAX_BODY_BYTES);
    expect(middlewareBodyLimitBytes('/api/professor/materials')).toBeGreaterThan(MIDDLEWARE_MAX_BODY_BYTES);
    expect(middlewareBodyLimitBytes('/api/professor/quiz/create')).toBe(MIDDLEWARE_MAX_BODY_BYTES);
  });
});
