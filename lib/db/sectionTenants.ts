import {
  fetchCourseById,
  fetchQuizById,
  fetchSectionsByIds,
} from '@/lib/db/entityScopedReads';
import { withTenant } from '@/lib/db/tenantContext';

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

type TenantTx = Parameters<Parameters<typeof withTenant>[2]>[0];

/**
 * Run a read for each tenant's share of `sectionIds` (under withTenant) and
 * concatenate the results. Callers re-sort / limit the merged list.
 */
export async function readBySectionTenants<T>(
  sectionIds: string[],
  userId: string | null,
  read: (tx: TenantTx, sectionIds: string[], tenantId: string) => Promise<T[]>,
): Promise<T[]> {
  if (sectionIds.length === 0) return [];
  const byTenant = await groupSectionIdsByTenant(sectionIds);
  const perTenant = await Promise.all(
    [...byTenant].map(([tenantId, ids]) =>
      withTenant(tenantId, userId, (tx) => read(tx, ids, tenantId)),
    ),
  );
  return perTenant.flat();
}

/**
 * Run a read under the tenant that owns `quizId` (resolved via a SECURITY
 * DEFINER lookup). Returns undefined when the quiz or its tenant is missing.
 */
export async function withQuizTenant<T>(
  quizId: string,
  userId: string | null,
  read: (tx: TenantTx, tenantId: string) => Promise<T>,
): Promise<T | undefined> {
  const quiz = await fetchQuizById(quizId);
  if (!quiz?.tenantId) return undefined;
  const tenantId = quiz.tenantId;
  return withTenant(tenantId, userId, (tx) => read(tx, tenantId));
}

/**
 * Run a read or write under the tenant that owns `courseId` (resolved via a
 * SECURITY DEFINER lookup). Returns undefined when the course or its tenant
 * is missing.
 */
export async function withCourseTenant<T>(
  courseId: string,
  userId: string | null,
  run: (tx: TenantTx, tenantId: string) => Promise<T>,
): Promise<T | undefined> {
  const course = await fetchCourseById(courseId);
  const tenantId = course?.tenantId ?? course?.workspaceId;
  if (!tenantId) return undefined;
  return withTenant(tenantId, userId, (tx) => run(tx, tenantId));
}
