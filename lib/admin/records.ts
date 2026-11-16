import {
  adminFetchCourseDefiner,
  adminFetchQuizDefiner,
  adminFetchSectionDefiner,
} from '@/lib/db/tenantWriteDefiners';

export type AdminRecordKind = 'course' | 'quiz' | 'section';

export type AdminRecord = {
  id: string;
  tenantId: string | null;
  deletedAt: string | null;
  /** title (course / quiz) or name (section). */
  label: string | null;
};

const fetchers = {
  course: adminFetchCourseDefiner,
  quiz: adminFetchQuizDefiner,
  section: adminFetchSectionDefiner,
} as const;

/**
 * Load the target of an admin action via its SECURITY DEFINER lookup.
 * Under FORCE RLS a plain db read sees nothing (every admin action on a
 * course / quiz / section was "not found"). Callers must still call
 * requireSupportGrant(user, tenantId) before touching the tenant's data.
 */
export async function loadAdminRecord(
  kind: AdminRecordKind,
  id: string,
): Promise<AdminRecord | null> {
  const raw = await fetchers[kind](id);
  if (!raw?.id) return null;
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(raw.id),
    tenantId: str(raw.tenant_id) ?? str(raw.workspace_id),
    deletedAt: str(raw.deleted_at),
    label: str(raw.title ?? raw.name),
  };
}
