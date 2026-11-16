import { beforeEach, describe, expect, it, vi } from 'vitest';

const memberships = vi.hoisted(() => vi.fn());
const withTenant = vi.hoisted(() =>
  vi.fn(async (tenantId: string, _u: string | null, fn: (tx: any) => any) => fn({ tenantId })),
);
vi.mock('@/lib/workspace/entitlement', () => ({ listActiveMembershipsForUser: memberships }));
vi.mock('@/lib/db/tenantContext', () => ({ withTenant }));

import { findInUserTenants, listUserTenantIds, readInUserTenants } from '@/lib/db/userTenants';

beforeEach(() => {
  withTenant.mockClear();
  memberships.mockResolvedValue([
    { workspaceId: 't1' },
    { workspaceId: 't2' },
    { workspaceId: 't1' },
  ]);
});

// FORCE RLS: reads must run under each of the user's tenants.
describe('userTenants', () => {
  it('lists distinct tenants', async () => {
    expect(await listUserTenantIds('u')).toEqual(['t1', 't2']);
  });

  it('reads every tenant under withTenant and concatenates', async () => {
    const rows = await readInUserTenants('u', async (_tx, tenantId) => [`${tenantId}-row`]);
    expect(rows).toEqual(['t1-row', 't2-row']);
    expect(withTenant.mock.calls.map((c) => [c[0], c[1]])).toEqual([['t1', 'u'], ['t2', 'u']]);
  });

  it('stops at the first tenant with a match', async () => {
    const found = await findInUserTenants('u', async (_tx, tenantId) =>
      tenantId === 't2' ? 'hit' : undefined,
    );
    expect(found).toBe('hit');
    expect(await findInUserTenants('u', async () => null)).toBeNull();
  });
});
