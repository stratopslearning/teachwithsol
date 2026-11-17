/**
 * Personal-access-token scopes are CAPS, not grants.
 * Effective scopes = token scopes ∩ permissions the owner currently holds via
 * role_bindings in the token's tenant. A revoked/demoted binding immediately
 * narrows the token; the token can never exceed the user.
 */
import { listBindingsForUser } from '@/lib/authz/authorize';
import {
  roleHasPermission,
  type BindingRole,
  type Permission,
} from '@/lib/authz/permissions';
import type { TokenScope } from '@/lib/professor/apiTokens';

/** A token scope is usable when the user holds ANY of these permissions. */
export const TOKEN_SCOPE_PERMISSIONS: Record<TokenScope, readonly Permission[]> = {
  read: ['content.read', 'catalog.read', 'roster.read'],
  'sections:write': ['roster.manage', 'catalog.create_offering'],
  'quizzes:write': ['content.write'],
  'grades:write': ['grade.write'],
  'discussions:write': ['content.write'],
  'materials:write': ['knowledge.manage', 'content.write'],
  'authoring:write': ['content.write'],
};

/** Pure: which token scopes survive for a user who holds `roles`. */
export function intersectScopesWithRoles(
  scopes: readonly TokenScope[],
  roles: readonly BindingRole[],
): TokenScope[] {
  return scopes.filter((scope) =>
    (TOKEN_SCOPE_PERMISSIONS[scope] ?? []).some((perm) =>
      roles.some((role) => roleHasPermission(role, perm)),
    ),
  );
}

/**
 * Effective scopes for a user. When `tenantId` is provided (PATs) only bindings
 * in that tenant count; OAuth connectors pass undefined (any tenant).
 */
export async function effectiveScopesForUser(
  userId: string,
  scopes: readonly TokenScope[],
  tenantId?: string | null,
): Promise<TokenScope[]> {
  const bindings = await listBindingsForUser(userId, tenantId ?? undefined);
  return intersectScopesWithRoles(
    scopes,
    bindings.map((b) => b.role),
  );
}
