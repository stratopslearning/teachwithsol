import { describe, expect, it, vi } from 'vitest';

const fetchSectionsByIds = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/entityScopedReads', () => ({ fetchSectionsByIds }));

import { groupSectionIdsByTenant } from '@/lib/db/sectionTenants';

const section = (id: string, tenantId: string | null, workspaceId: string | null, courseWs: string | null) => ({
  id, tenantId, workspaceId, course: { id: 'c', title: 'C', workspaceId: courseWs },
});

describe('groupSectionIdsByTenant', () => {
  it('groups sections by tenant, falling back to workspace then course workspace', async () => {
    fetchSectionsByIds.mockResolvedValue([
      section('s1', 't1', null, null),
      section('s2', null, 't1', null),
      section('s3', null, null, 't2'),
      section('s4', null, null, null),
    ]);
    const groups = await groupSectionIdsByTenant(['s1', 's2', 's3', 's4', 's1']);
    expect(fetchSectionsByIds).toHaveBeenCalledWith(['s1', 's2', 's3', 's4']);
    expect(Object.fromEntries(groups)).toEqual({ t1: ['s1', 's2'], t2: ['s3'] });
  });
});
