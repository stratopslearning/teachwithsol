import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';

/**
 * Group section ids by the tenant that owns them (via a SECURITY DEFINER
 * lookup), so callers can read each group under withTenant. A teacher's
 * sections can span several workspaces. Sections with no resolvable tenant
 * are left out: under FORCE RLS their rows can't be read anyway.
 */
export async function groupSectionIdsByTenant(
  sectionIds: string[],
): Promise<Map<string, string[]>> {
  const groups = new Map<string, string[]>();
  for (const s of await fetchSectionsByIds([...new Set(sectionIds)])) {
    const tenantId = s.tenantId ?? s.workspaceId ?? s.course.workspaceId;
    if (!tenantId) continue;
    const list = groups.get(tenantId) ?? [];
    list.push(s.id);
    groups.set(tenantId, list);
  }
  return groups;
}
