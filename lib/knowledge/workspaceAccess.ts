import { ApiError } from '@/lib/api/errors';
import { authorize } from '@/lib/authz/authorize';
import {
  roleHasPermission,
  type AuthzRole,
} from '@/lib/authz/permissions';
import { fetchUserRoleBindings } from '@/lib/authz/userScopedReads';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';
import { requireWorkspaceTeaching } from '@/lib/workspace/entitlement';

/** Roles that may use workspace Knowledge / authoring library reads. */
export function roleGrantsWorkspaceFacultyAccess(role: AuthzRole): boolean {
  return (
    roleHasPermission(role, 'catalog.read') ||
    roleHasPermission(role, 'knowledge.manage') ||
    roleHasPermission(role, 'content.read')
  );
}

/**
 * True when the user holds a teaching binding in this tenant that grants
 * catalog/knowledge/content access — at org, department, offering, or section
 * scope. Section co-instructors (faculty join codes) must count; org-only
 * authorize() checks incorrectly excluded them.
 */
async function userHasWorkspaceFacultyBinding(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const bindings = await fetchUserRoleBindings(userId, workspaceId);
  return bindings.some((b) => roleGrantsWorkspaceFacultyAccess(b.role));
}

async function assertWorkspaceFacultyRole(
  user: AuthUser,
  workspaceId: string,
): Promise<void> {
  if (await userHasWorkspaceFacultyBinding(user.id, workspaceId)) return;
  throw ApiError.forbidden('Not a faculty member of this workspace');
}

/** Role check only — safe for reads (policy GET, etc.). */
export async function assertWorkspaceFacultyRead(
  user: AuthUser,
  workspaceId: string,
): Promise<void> {
  await assertWorkspaceFacultyRole(user, workspaceId);
}

/**
 * Faculty role + teaching entitlement. Use for knowledge/connector writes.
 * Platform staff skip entitlement (support grant enforced elsewhere).
 */
export async function assertWorkspaceFaculty(
  user: AuthUser,
  workspaceId: string,
): Promise<void> {
  await assertWorkspaceFacultyRole(user, workspaceId);
  await requireWorkspaceTeaching(workspaceId, user);
}

/** Shared-library mutate + connector admin (owner/admin only). */
export async function assertWorkspaceLibraryAdmin(
  user: AuthUser,
  workspaceId: string,
): Promise<void> {
  const ok = await authorize(user, 'knowledge.manage', {
    tenantId: workspaceId,
    scopeType: 'organization',
    scopeId: workspaceId,
  });
  if (!ok) {
    throw ApiError.forbidden(
      'Only workspace owners or admins can manage the shared library',
    );
  }
  await requireWorkspaceTeaching(workspaceId, user);
}

/**
 * Library coordinator = `knowledge.manage` at organization scope
 * (owner/admin role bindings). Membership seats carry no power.
 */
export async function isWorkspaceKnowledgeCoordinator(
  user: AuthUser,
  workspaceId: string,
): Promise<boolean> {
  return authorize(user, 'knowledge.manage', {
    tenantId: workspaceId,
    scopeType: 'organization',
    scopeId: workspaceId,
  });
}
