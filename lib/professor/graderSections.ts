import { listBindingsForUser } from '@/lib/authz/authorize';
import {
  fetchUserTeachingSectionIds,
} from '@/lib/db/entityScopedReads';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';

/** Section ids where the user may grade via scoped bindings (DEFINER). */
export async function listGradeableSectionIdsFromGrants(
  userId: string,
): Promise<string[]> {
  return fetchUserTeachingSectionIds(userId);
}

/**
 * Sections the user may teach/grade. Role bindings are the ONLY source;
 * professor_sections is roster metadata and confers no authority.
 */
export async function listTeachingSectionIds(user: AuthUser): Promise<string[]> {
  return listGradeableSectionIdsFromGrants(user.id);
}

/** True when the user has section staff bindings but no lead/co/owner/admin/faculty binding. */
export async function isGrantOnlyTeachingAssistant(
  userId: string,
): Promise<boolean> {
  const grantIds = await listGradeableSectionIdsFromGrants(userId);
  if (grantIds.length === 0) return false;

  const bindings = await listBindingsForUser(userId);
  const leadOrCo = bindings.some((b) =>
    (
      [
        'lead_instructor',
        'co_instructor',
        'owner',
        'admin',
        'faculty',
      ] as string[]
    ).includes(b.role),
  );
  return !leadOrCo;
}
