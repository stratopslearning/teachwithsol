import { resolveFacultyWorkspaceId } from '@/lib/workspace/activeWorkspace';

/**
 * Optional workspace disambiguation for professor enrollment by code.
 * Cross-workspace joins do not require this — enrollInSection falls back to a
 * global code lookup when workspaceId is omitted.
 */
export async function resolveProfessorEnrollWorkspaceId(
  userId: string,
  bodyWorkspaceId?: string | null,
): Promise<
  | { ok: true; workspaceId: string }
  | { ok: false; status: number; error: string }
> {
  const resolved = await resolveFacultyWorkspaceId(userId, bodyWorkspaceId);
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.code === 'forbidden' ? 403 : 400,
      error: resolved.message,
    };
  }
  return { ok: true, workspaceId: resolved.workspaceId };
}

/** Workspace scope for student enrollment (body, sole active membership seat, or ambiguous). */
export async function resolveStudentEnrollWorkspaceId(
  userId: string,
  bodyWorkspaceId?: string | null,
): Promise<
  | { ok: true; workspaceId: string | null; requireGlobalUnique: boolean }
  | { ok: false; status: number; error: string }
> {
  const trimmed = bodyWorkspaceId?.trim();
  if (trimmed) {
    return { ok: true, workspaceId: trimmed, requireGlobalUnique: false };
  }

  // FORCE RLS: a plain db read returned no memberships, so the sole-seat
  // shortcut never applied. Use the SECURITY DEFINER membership lookup.
  const { fetchUserActiveMembershipsDetail } = await import(
    '@/lib/authz/userScopedReads'
  );
  const learnerRows = (await fetchUserActiveMembershipsDetail(userId)).filter(
    (m) => m.status === 'active',
  );
  const learnerIds = [...new Set(learnerRows.map((r) => r.workspaceId))];
  if (learnerIds.length === 1) {
    return {
      ok: true,
      workspaceId: learnerIds[0]!,
      requireGlobalUnique: false,
    };
  }

  // No scope: allow lookup only when the code is globally unique.
  return { ok: true, workspaceId: null, requireGlobalUnique: true };
}
