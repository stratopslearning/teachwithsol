import {
  authorize,
  listBindingsForUser,
  type AuthzResource,
} from '@/lib/authz/authorize';
import {
  TEACHING_ROLES,
  WORKSPACE_ADMIN_ROLES,
  type BindingRole,
  type Permission,
} from '@/lib/authz/permissions';
import {
  fetchUserRoleBindings,
  userHasAnyActiveEnrollment,
} from '@/lib/authz/userScopedReads';
import { appRedirect } from '@/lib/serverRedirect';
import {
  getOrCreateUser,
  type UserData,
} from '@/lib/getOrCreateUser';

export type DashboardAreas = {
  teaching: boolean;
  learning: boolean;
  workspaceAdmin: boolean;
  platformStaff: boolean;
};

export async function getDashboardAreas(
  user: Pick<UserData, 'id'> & { platformStaff?: boolean | null },
): Promise<DashboardAreas> {
  const bindings = await listBindingsForUser(user.id);
  const teaching = bindings.some((b) =>
    TEACHING_ROLES.includes(b.role as BindingRole),
  );
  const workspaceAdmin = bindings.some((b) =>
    WORKSPACE_ADMIN_ROLES.includes(b.role),
  );

  return {
    teaching,
    learning: await userHasAnyActiveEnrollment(user.id),
    workspaceAdmin,
    platformStaff: Boolean(user.platformStaff),
  };
}

export async function userCanAccessTeachingArea(userId: string): Promise<boolean> {
  const bindings = await listBindingsForUser(userId);
  return bindings.some((b) => TEACHING_ROLES.includes(b.role));
}

export async function userCanAccessLearningArea(userId: string): Promise<boolean> {
  return userHasAnyActiveEnrollment(userId);
}

/**
 * Student JSON APIs that may run before the first enrollment (e.g. enroll).
 * Blocks teaching-only accounts; dual-role users with enrollments use learning APIs.
 */
export async function userMayUsePreEnrollStudentApi(
  userId: string,
): Promise<boolean> {
  if (await userCanAccessLearningArea(userId)) return true;
  if (await userCanAccessTeachingArea(userId)) return false;
  return true;
}

export async function requireTeachingAccess(): Promise<UserData> {
  const user = await getOrCreateUser();
  if (!user) appRedirect('/login');
  const ok = await userCanAccessTeachingArea(user.id);
  if (!ok) {
    const learning = await userCanAccessLearningArea(user.id);
    appRedirect(learning ? '/dashboard/student' : '/onboarding');
  }
  return user;
}

export async function requireLearningAccess(): Promise<UserData> {
  const user = await getOrCreateUser();
  if (!user) appRedirect('/login');
  const learning = await userCanAccessLearningArea(user.id);
  if (learning) return user;
  // Allow first-time learners (no enrollments yet) to reach enroll UI unless
  // they already hold teaching bindings only.
  const teaching = await userCanAccessTeachingArea(user.id);
  if (teaching) appRedirect('/dashboard/professor');
  return user;
}

export async function requireWorkspaceAdminAccess(
  workspaceId: string,
): Promise<UserData> {
  const user = await getOrCreateUser();
  if (!user) appRedirect('/login');
  const allowed = await authorize(user, 'audit.read', {
    tenantId: workspaceId,
    scopeType: 'organization',
    scopeId: workspaceId,
  });
  if (!allowed) {
    appRedirect('/dashboard/professor');
  }
  return user;
}

export async function requirePlatformStaff(): Promise<UserData> {
  const user = await getOrCreateUser();
  if (!user) appRedirect('/login');
  if (!user.platformStaff) {
    const teaching = await userCanAccessTeachingArea(user.id);
    const learning = await userCanAccessLearningArea(user.id);
    if (teaching) appRedirect('/dashboard/professor');
    if (learning) appRedirect('/dashboard/student');
    appRedirect('/onboarding');
  }
  return user;
}

export async function requirePermission(
  permission: Permission,
  resource: AuthzResource,
): Promise<UserData> {
  const user = await getOrCreateUser();
  if (!user) appRedirect('/login');
  const ok = await authorize(user, permission, resource);
  if (!ok) appRedirect('/dashboard');
  return user;
}

/** Workspaces where the user holds any active binding (for switcher). */
export async function listBoundWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await fetchUserRoleBindings(userId);
  return [...new Set(rows.map((r) => r.tenantId))];
}
