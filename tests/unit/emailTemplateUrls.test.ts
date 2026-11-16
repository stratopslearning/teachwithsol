import { afterEach, describe, expect, it, vi } from 'vitest';

function clearSolHosts() {
  delete process.env.NEXT_PUBLIC_SOL_MARKETING_HOST;
  delete process.env.NEXT_PUBLIC_SOL_APP_HOST;
  delete process.env.NEXT_PUBLIC_SOL_DOCS_HOST;
  delete process.env.NEXT_PUBLIC_SOL_TRUST_HOST;
}

// Regression: with no base URL the team link was a relative path, which email
// clients can't open.
describe('workspaceTeamUrl', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('is absolute even when NEXT_PUBLIC_BASE_URL is unset', async () => {
    clearSolHosts();
    delete process.env.NEXT_PUBLIC_BASE_URL;
    const { workspaceTeamUrl } = await import('@/lib/email/templates');
    expect(workspaceTeamUrl()).toMatch(/^https?:\/\//);
  });

  it('uses the base URL and basePath off Sol', async () => {
    clearSolHosts();
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://www.strat-ops.net');
    const { workspaceTeamUrl } = await import('@/lib/email/templates');
    expect(workspaceTeamUrl()).toBe('https://www.strat-ops.net/learning/dashboard/workspace');
  });

  it('points at the app host on Sol multi-host deploys', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://app.teachwithsol.com');
    vi.stubEnv('NEXT_PUBLIC_SOL_MARKETING_HOST', 'www.teachwithsol.com');
    vi.stubEnv('NEXT_PUBLIC_SOL_APP_HOST', 'app.teachwithsol.com');
    vi.stubEnv('NEXT_PUBLIC_SOL_DOCS_HOST', 'docs.teachwithsol.com');
    vi.stubEnv('NEXT_PUBLIC_SOL_TRUST_HOST', 'trust.teachwithsol.com');
    const { workspaceTeamUrl } = await import('@/lib/email/templates');
    expect(workspaceTeamUrl()).toBe('https://app.teachwithsol.com/dashboard/workspace');
  });
});
