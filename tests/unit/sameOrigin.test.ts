import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  allowedOrigins,
  isBodyTooLarge,
  isLargeUploadApiPath,
  isMutatingMethod,
  isOriginExemptPath,
  isSameOrigin,
  isBookUploadApiPath,
  middlewareBodyLimitBytes,
  MIDDLEWARE_BOOK_UPLOAD_MAX_BODY_BYTES,
  MIDDLEWARE_MAX_BODY_BYTES,
  MIDDLEWARE_UPLOAD_MAX_BODY_BYTES,
  shouldEnforceSameOrigin,
} from '@/lib/api/sameOrigin';

function headers(map: Record<string, string>) {
  return {
    get(name: string) {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

describe('isMutatingMethod', () => {
  it('flags POST PUT PATCH DELETE', () => {
    expect(isMutatingMethod('POST')).toBe(true);
    expect(isMutatingMethod('put')).toBe(true);
    expect(isMutatingMethod('GET')).toBe(false);
    expect(isMutatingMethod('OPTIONS')).toBe(false);
  });
});

describe('isOriginExemptPath', () => {
  it('exempts webhooks, cron, and mcp', () => {
    expect(isOriginExemptPath('/api/stripe/webhook')).toBe(true);
    expect(isOriginExemptPath('/api/clerk/webhook')).toBe(true);
    expect(isOriginExemptPath('/api/cron/grade-pending')).toBe(true);
    expect(isOriginExemptPath('/api/mcp')).toBe(true);
    expect(isOriginExemptPath('/api/quiz/x/submit')).toBe(false);
  });
});

describe('allowedOrigins / isSameOrigin', () => {
  const prevBase = process.env.NEXT_PUBLIC_BASE_URL;
  const prevVercel = process.env.VERCEL_URL;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://www.strat-ops.net';
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    if (prevBase === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = prevBase;
    if (prevVercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = prevVercel;
    vi.unstubAllEnvs();
    if (prevNodeEnv !== undefined) {
      vi.stubEnv('NODE_ENV', prevNodeEnv);
    }
  });

  it('includes NEXT_PUBLIC_BASE_URL', () => {
    expect(allowedOrigins()).toContain('https://www.strat-ops.net');
  });

  it('includes Sol multi-host origins when configured', () => {
    process.env.NEXT_PUBLIC_SOL_MARKETING_HOST = 'www.teachwithsol.com';
    process.env.NEXT_PUBLIC_SOL_APP_HOST = 'app.teachwithsol.com';
    process.env.NEXT_PUBLIC_SOL_DOCS_HOST = 'docs.teachwithsol.com';
    process.env.NEXT_PUBLIC_SOL_TRUST_HOST = 'trust.teachwithsol.com';
    const origins = allowedOrigins();
    expect(origins).toContain('https://www.teachwithsol.com');
    expect(origins).toContain('https://teachwithsol.com');
    expect(origins).toContain('https://app.teachwithsol.com');
    expect(origins).toContain('https://docs.teachwithsol.com');
    expect(origins).toContain('https://trust.teachwithsol.com');
  });

  it('accepts matching Origin', () => {
    expect(
      isSameOrigin({
        headers: headers({ origin: 'https://www.strat-ops.net' }),
      }),
    ).toBe(true);
  });

  it('rejects cross-site Origin', () => {
    expect(
      isSameOrigin({
        headers: headers({ origin: 'https://evil.example' }),
      }),
    ).toBe(false);
  });

  it('accepts matching Referer when Origin is absent', () => {
    expect(
      isSameOrigin({
        headers: headers({
          referer: 'https://www.strat-ops.net/learning/dashboard',
        }),
      }),
    ).toBe(true);
  });

  it('fails closed when both Origin and Referer are missing', () => {
    expect(isSameOrigin({ headers: headers({}) })).toBe(false);
  });

  it('includes VERCEL_URL as https origin', () => {
    process.env.VERCEL_URL = 'sol-git-preview.vercel.app';
    expect(allowedOrigins()).toContain('https://sol-git-preview.vercel.app');
  });
});

describe('shouldEnforceSameOrigin', () => {
  it('skips GET and exempt paths', () => {
    expect(
      shouldEnforceSameOrigin('GET', '/api/quiz/x/submit', null, false),
    ).toBe(false);
    expect(
      shouldEnforceSameOrigin('POST', '/api/stripe/webhook', null, false),
    ).toBe(false);
    expect(
      shouldEnforceSameOrigin('POST', '/api/cron/grade-pending', null, false),
    ).toBe(false);
  });

  it('skips Bearer PAT and load-test', () => {
    expect(
      shouldEnforceSameOrigin(
        'POST',
        '/api/professor/quiz/create',
        'Bearer sol_pat_abc',
        false,
      ),
    ).toBe(false);
    expect(
      shouldEnforceSameOrigin('POST', '/api/quiz/x/submit', null, true),
    ).toBe(false);
  });

  it('enforces on cookie quiz submit', () => {
    expect(
      shouldEnforceSameOrigin('POST', '/api/quiz/x/submit', null, false),
    ).toBe(true);
  });
});

describe('isBodyTooLarge', () => {
  it('rejects when Content-Length exceeds max', () => {
    expect(isBodyTooLarge('2000000', 1_048_576)).toBe(true);
    expect(isBodyTooLarge('100', 1_048_576)).toBe(false);
    expect(isBodyTooLarge(null)).toBe(false);
  });
});

describe('middleware upload body limits', () => {
  it('allows ~51 MB for materials, knowledge docs, and H5P import paths', () => {
    expect(isLargeUploadApiPath('/api/professor/materials')).toBe(true);
    expect(isLargeUploadApiPath('/api/professor/knowledge/documents')).toBe(
      true,
    );
    expect(isLargeUploadApiPath('/api/professor/interactive/import')).toBe(
      true,
    );
    expect(isLargeUploadApiPath('/api/quiz/x/submit')).toBe(false);
    expect(middlewareBodyLimitBytes('/api/professor/materials')).toBe(
      MIDDLEWARE_UPLOAD_MAX_BODY_BYTES,
    );
    expect(
      middlewareBodyLimitBytes('/api/professor/knowledge/documents'),
    ).toBe(MIDDLEWARE_UPLOAD_MAX_BODY_BYTES);
    expect(middlewareBodyLimitBytes('/api/quiz/x/submit')).toBe(
      MIDDLEWARE_MAX_BODY_BYTES,
    );
    expect(
      isBodyTooLarge(
        String(40 * 1024 * 1024),
        middlewareBodyLimitBytes('/api/professor/materials'),
      ),
    ).toBe(false);
    expect(
      isBodyTooLarge(
        String(52 * 1024 * 1024),
        middlewareBodyLimitBytes('/api/professor/materials'),
      ),
    ).toBe(true);
    expect(
      isBodyTooLarge('5000000', middlewareBodyLimitBytes('/api/quiz/x/submit')),
    ).toBe(true);
  });

  it('lets a max-size book plus multipart framing through', () => {
    expect(
      isBodyTooLarge(
        String(50 * 1024 * 1024 + 200 * 1024),
        middlewareBodyLimitBytes('/api/professor/books'),
      ),
    ).toBe(false);
  });

  it('allows 50 MB for hosted book EPUB/XML uploads', () => {
    expect(isBookUploadApiPath('/api/professor/books')).toBe(true);
    expect(isBookUploadApiPath('/api/professor/books/abc')).toBe(true);
    expect(isBookUploadApiPath('/api/professor/materials')).toBe(false);
    expect(middlewareBodyLimitBytes('/api/professor/books')).toBe(
      MIDDLEWARE_BOOK_UPLOAD_MAX_BODY_BYTES,
    );
    expect(
      isBodyTooLarge(
        String(40 * 1024 * 1024),
        middlewareBodyLimitBytes('/api/professor/books'),
      ),
    ).toBe(false);
    expect(
      isBodyTooLarge(
        String(52 * 1024 * 1024),
        middlewareBodyLimitBytes('/api/professor/books'),
      ),
    ).toBe(true);
  });
});

describe('upload limits stay derived from one source', () => {
  it('middleware caps are the file caps plus multipart headroom', async () => {
    const limits = await import('@/lib/uploadLimits');
    expect(MIDDLEWARE_UPLOAD_MAX_BODY_BYTES).toBe(
      limits.MAX_ZIP_UPLOAD_BYTES + limits.MULTIPART_HEADROOM_BYTES,
    );
    expect(MIDDLEWARE_BOOK_UPLOAD_MAX_BODY_BYTES).toBe(
      limits.MAX_BOOK_UPLOAD_BYTES + limits.MULTIPART_HEADROOM_BYTES,
    );
  });
});
