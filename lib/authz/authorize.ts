import { eq } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  courses,
  courseOfferings,
  sections,
  workspaces,
} from '@/app/db/schema';
import {
  isStudentPermission,
  legacyActionToPermission,
  roleHasPermission,
  type BindingRole,
  type LegacyAuthzAction,
  type Permission,
} from '@/lib/authz/permissions';
import { platformStaffHasTenantDataAccess } from '@/lib/authz/supportAccess';
import {
  fetchUserRoleBindings,
  userEnrolledInSection,
} from '@/lib/authz/userScopedReads';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';

export type AuthzScopeType =
  | 'organization'
  | 'department'
  | 'offering'
  | 'section';

/** @deprecated Prefer BindingRole from permissions.ts */
export type AuthzGrantRole = BindingRole | 'instructor' | 'learner';

/** @deprecated Prefer Permission */
export type AuthzAction = LegacyAuthzAction;

export type AuthzResource = {
  tenantId: string;
  scopeType: AuthzScopeType;
  scopeId: string;
  /** Optional denormalized parents to avoid extra lookups. */
  offeringId?: string | null;
  organizationId?: string | null;
};

type ScopeRef = { scopeType: AuthzScopeType; scopeId: string };

type CachedBinding = {
  role: BindingRole;
  scopeType: AuthzScopeType;
  scopeId: string;
};

/**
 * Short-TTL in-process cache. Other instances only learn about revocations after
 * the TTL, so keep it small; local writes call clearBindingCache() immediately.
 */
const BINDING_CACHE_TTL_MS = 1_000;
const bindingCache = new Map<
  string,
  { at: number; value: Promise<CachedBinding[]> }
>();

function cacheKey(userId: string, tenantId: string): string {
  return `${userId}:${tenantId}`;
}

/** Clear per-request binding cache (tests / after writes). */
export function clearBindingCache(userId?: string, tenantId?: string): void {
  if (!userId) {
    bindingCache.clear();
    return;
  }
  if (tenantId) {
    bindingCache.delete(cacheKey(userId, tenantId));
    return;
  }
  for (const key of bindingCache.keys()) {
    if (key.startsWith(`${userId}:`)) bindingCache.delete(key);
  }
}

async function loadBindings(
  userId: string,
  tenantId: string,
): Promise<CachedBinding[]> {
  const key = cacheKey(userId, tenantId);
  const hit = bindingCache.get(key);
  let pending = hit && Date.now() - hit.at < BINDING_CACHE_TTL_MS ? hit.value : undefined;
  if (!pending) {
    pending = fetchUserRoleBindings(userId, tenantId).then((rows) =>
      rows.map((r) => ({
        role: r.role,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
      })),
    );
    bindingCache.set(key, { at: Date.now(), value: pending });
  }
  return pending;
}

async function resolveAncestorScopes(
  resource: AuthzResource,
): Promise<ScopeRef[]> {
  const orgId = resource.organizationId ?? resource.tenantId;
  const chain: ScopeRef[] = [
    { scopeType: resource.scopeType, scopeId: resource.scopeId },
  ];

  if (resource.scopeType === 'section') {
    let offeringId = resource.offeringId ?? null;
    if (!offeringId) {
      const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
      const section = await fetchSectionById(resource.scopeId);
      offeringId = section?.offeringId ?? null;
    }
    if (offeringId) {
      chain.push({ scopeType: 'offering', scopeId: offeringId });
    }
  }

  if (resource.scopeType === 'offering' || resource.scopeType === 'section') {
    const { sql } = await import('drizzle-orm');
    const typeResult = await db.execute(sql`
      SELECT sol_workspace_type(${resource.tenantId}::uuid) AS type
    `);
    const rows =
      (typeResult as unknown as { rows?: { type: string | null }[] }).rows ??
      (Array.isArray(typeResult)
        ? (typeResult as { type: string | null }[])
        : []);
    const wsType = rows[0]?.type;
    if (wsType === 'department' || wsType === 'institution') {
      chain.push({ scopeType: 'department', scopeId: resource.tenantId });
    }
  }

  if (
    resource.scopeType !== 'organization' ||
    resource.scopeId !== orgId
  ) {
    chain.push({ scopeType: 'organization', scopeId: orgId });
  } else if (!chain.some((c) => c.scopeType === 'organization')) {
    chain.push({ scopeType: 'organization', scopeId: orgId });
  }

  // Dedupe
  const seen = new Set<string>();
  return chain.filter((c) => {
    const k = `${c.scopeType}:${c.scopeId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function hasActiveEnrollment(
  userId: string,
  sectionId: string,
): Promise<boolean> {
  return userEnrolledInSection(userId, sectionId);
}

function normalizePermission(
  permissionOrAction: Permission | LegacyAuthzAction,
): Permission {
  if (
    permissionOrAction === 'read' ||
    permissionOrAction === 'write' ||
    permissionOrAction === 'manage' ||
    permissionOrAction === 'grade' ||
    permissionOrAction === 'teach' ||
    permissionOrAction === 'learn'
  ) {
    return legacyActionToPermission(permissionOrAction);
  }
  return permissionOrAction;
}

/**
 * Authorize a permission on a scoped resource.
 * Power comes only from role_bindings (and student_sections for student perms).
 * Membership roles are ignored. Platform staff need an active support grant.
 */
export async function authorize(
  user: AuthUser,
  permissionOrAction: Permission | LegacyAuthzAction,
  resource: AuthzResource,
): Promise<boolean> {
  const permission = normalizePermission(permissionOrAction);

  if (user.platformStaff) {
    return platformStaffHasTenantDataAccess(user, resource.tenantId);
  }

  const bindings = await loadBindings(user.id, resource.tenantId);
  const ancestors = await resolveAncestorScopes(resource);

  for (const binding of bindings) {
    const onAncestor = ancestors.some(
      (a) =>
        a.scopeType === binding.scopeType && a.scopeId === binding.scopeId,
    );
    if (!onAncestor) continue;
    if (roleHasPermission(binding.role, permission)) return true;
  }

  if (
    isStudentPermission(permission) &&
    resource.scopeType === 'section' &&
    (await hasActiveEnrollment(user.id, resource.scopeId))
  ) {
    return roleHasPermission('student', permission);
  }

  // content.read for enrolled students on their section
  if (
    permission === 'content.read' &&
    resource.scopeType === 'section' &&
    (await hasActiveEnrollment(user.id, resource.scopeId))
  ) {
    return true;
  }

  return false;
}

export async function userHasAnyBinding(
  userId: string,
  tenantId: string,
  roles?: BindingRole[],
): Promise<boolean> {
  const bindings = await loadBindings(userId, tenantId);
  if (bindings.length === 0) return false;
  if (!roles) return true;
  return bindings.some((b) => roles.includes(b.role));
}

export async function listBindingsForUser(
  userId: string,
  tenantId?: string,
): Promise<
  Array<{
    tenantId: string;
    role: BindingRole;
    scopeType: AuthzScopeType;
    scopeId: string;
  }>
> {
  return fetchUserRoleBindings(userId, tenantId);
}

/** Resolve tenant id for a course (workspace). */
export async function tenantIdForCourse(
  courseId: string,
): Promise<string | null> {
  const { fetchCourseById } = await import('@/lib/db/entityScopedReads');
  const course = await fetchCourseById(courseId);
  return course?.workspaceId ?? null;
}

/** Resolve tenant id for a section via denormalized or course workspace. */
export async function tenantIdForSection(
  sectionId: string,
): Promise<string | null> {
  const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
  const section = await fetchSectionById(sectionId);
  if (!section) return null;
  if (section.tenantId) return section.tenantId;
  if (section.workspaceId) return section.workspaceId;
  return tenantIdForCourse(section.courseId);
}

export async function tenantIdForOffering(
  offeringId: string,
): Promise<string | null> {
  const { fetchOfferingCourseId } = await import(
    '@/lib/workspace/workspaceScopedReads'
  );
  const courseId = await fetchOfferingCourseId(offeringId);
  if (!courseId) return null;
  return tenantIdForCourse(courseId);
}
