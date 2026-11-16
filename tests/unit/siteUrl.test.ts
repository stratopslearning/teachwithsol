import { afterEach, describe, expect, it, vi } from 'vitest';

describe('lib/siteUrl', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('uses BASE_URL + basePath when Sol hosts unset', async () => {
    delete process.env.NEXT_PUBLIC_SOL_MARKETING_HOST;
    delete process.env.NEXT_PUBLIC_SOL_APP_HOST;
    delete process.env.NEXT_PUBLIC_SOL_DOCS_HOST;
    delete process.env.NEXT_PUBLIC_SOL_TRUST_HOST;
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://www.strat-ops.net');
    const { absoluteUrl, siteOrigin } = await import('@/lib/siteUrl');
    expect(siteOrigin()).toBe('https://www.strat-ops.net');
    expect(absoluteUrl('/docs')).toBe('https://www.strat-ops.net/learning/docs');
  });

  it('uses Sol marketing/docs hosts when configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://app.teachwithsol.com');
    vi.stubEnv('NEXT_PUBLIC_SOL_MARKETING_HOST', 'www.teachwithsol.com');
    vi.stubEnv('NEXT_PUBLIC_SOL_APP_HOST', 'app.teachwithsol.com');
    vi.stubEnv('NEXT_PUBLIC_SOL_DOCS_HOST', 'docs.teachwithsol.com');
    vi.stubEnv('NEXT_PUBLIC_SOL_TRUST_HOST', 'trust.teachwithsol.com');
    const { absoluteUrl, siteOrigin } = await import('@/lib/siteUrl');
    expect(siteOrigin()).toBe('https://www.teachwithsol.com');
    expect(absoluteUrl('/')).toBe('https://www.teachwithsol.com');
    expect(absoluteUrl('/docs')).toBe('https://docs.teachwithsol.com/docs');
    expect(absoluteUrl('/security')).toBe(
      'https://trust.teachwithsol.com/security',
    );
    expect(absoluteUrl('/sitemap.xml')).toBe(
      'https://www.teachwithsol.com/sitemap.xml',
    );
  });
});

describe('appBaseUrl', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('trims the trailing slash from NEXT_PUBLIC_BASE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://app.teachwithsol.com/');
    const { appBaseUrl } = await import('@/lib/siteUrl');
    expect(appBaseUrl()).toBe('https://app.teachwithsol.com');
  });

  it('is undefined when unset or empty (callers build relative links)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    const { appBaseUrl } = await import('@/lib/siteUrl');
    expect(appBaseUrl()).toBeUndefined();
  });
});
