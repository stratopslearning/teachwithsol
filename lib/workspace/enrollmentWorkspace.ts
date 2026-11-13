import { and, eq } from 'drizzle-orm';

import { db } from '@/app/db';
import { workspaceMemberships } from '@/app/db/schema';
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

  const learnerRows = await db.query.workspaceMemberships.findMany({
    where: and(
      eq(workspaceMemberships.userId, userId),
      eq(workspaceMemberships.status, 'active'),
    ),
    columns: { workspaceId: true },
  });
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
