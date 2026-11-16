import { BINDING_ROLES, type BindingRole } from '@/app/db/enums';

/**
 * Permission catalog and role bundles for scoped role bindings.
 * Membership seats carry no power — only bindings (and student_sections) do.
 */

export const PERMISSIONS = [
  'billing.manage',
  'ownership.transfer',
  'people.invite',
  'people.remove',
  'policy.manage',
  'templates.manage',
  'caps.manage',
  'audit.read',
  'rollups.read',
  'workspace.export',
  'lti.manage',
  'catalog.read',
  'catalog.create_course',
  'catalog.create_offering',
  'content.read',
  'content.write',
  'content.publish',
  'rubric.manage',
  'grade.write',
  'grade.override',
  'grade.release',
  'staff.manage',
  'staff.remove_lead',
  'roster.manage',
  'roster.read',
  'regrade.resolve',
  'tutor.transcripts.read',
  'knowledge.manage',
  'student.submit',
  'student.tutor',
  'student.grades_own',
  'student.export_own',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type { BindingRole };

/** Implicit via student_sections — not stored on role_bindings. */
export type StudentRole = 'student';

export type AuthzRole = BindingRole | StudentRole;

const ALL: Permission[] = [...PERMISSIONS];

const ADMIN_PERMS: Permission[] = [
  'people.invite',
  'people.remove',
  'policy.manage',
  'templates.manage',
  'caps.manage',
  'audit.read',
  'rollups.read',
  'workspace.export',
  'lti.manage',
  'catalog.read',
  'catalog.create_course',
  'catalog.create_offering',
  'knowledge.manage',
  'billing.manage',
];

const FACULTY_PERMS: Permission[] = [
  'catalog.read',
  'catalog.create_course',
  'catalog.create_offering',
  'content.read',
];

const LEAD_PERMS: Permission[] = [
  'catalog.read',
  'content.read',
  'content.write',
  'content.publish',
  'rubric.manage',
  'grade.write',
  'grade.override',
  'grade.release',
  'staff.manage',
  'staff.remove_lead',
  'roster.manage',
  'roster.read',
  'regrade.resolve',
  'tutor.transcripts.read',
  'knowledge.manage',
];

const CO_PERMS: Permission[] = LEAD_PERMS.filter((p) => p !== 'staff.remove_lead');

const TA_PERMS: Permission[] = [
  'content.read',
  'roster.read',
  'grade.write',
  'regrade.resolve',
  'tutor.transcripts.read',
];

const GRADER_PERMS: Permission[] = ['content.read', 'grade.write'];

const STUDENT_PERMS: Permission[] = [
  'student.submit',
  'student.tutor',
  'student.grades_own',
  'student.export_own',
  'content.read',
];

export const ROLE_PERMISSIONS: Record<AuthzRole, ReadonlySet<Permission>> = {
  owner: new Set(ALL),
  admin: new Set(ADMIN_PERMS),
  faculty: new Set(FACULTY_PERMS),
  lead_instructor: new Set(LEAD_PERMS),
  co_instructor: new Set(CO_PERMS),
  ta: new Set(TA_PERMS),
  grader: new Set(GRADER_PERMS),
  student: new Set(STUDENT_PERMS),
};

export function roleHasPermission(role: AuthzRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isStudentPermission(permission: Permission): boolean {
  return ROLE_PERMISSIONS.student.has(permission);
}

/**
 * Valid (role, scope_type) pairs for role_bindings.
 * MUST mirror the CHECK constraint in drizzle/0043_role_binding_constraints.sql.
 */
export type BindingScopeType =
  | 'organization'
  | 'department'
  | 'offering'
  | 'section';

export const ROLE_SCOPE_PAIRS: Record<BindingRole, readonly BindingScopeType[]> =
  {
    owner: ['organization'],
    admin: ['organization', 'department'],
    faculty: ['organization', 'department'],
    lead_instructor: ['offering', 'section'],
    co_instructor: ['offering', 'section'],
    ta: ['offering', 'section'],
    grader: ['offering', 'section'],
  };

export function isValidRoleScopePair(
  role: string,
  scopeType: string,
): boolean {
  const scopes = ROLE_SCOPE_PAIRS[role as BindingRole];
  return Boolean(scopes?.includes(scopeType as BindingScopeType));
}

/** True when every permission of `b` is also granted by `a` (a ⊇ b). */
export function roleIsSupersetOf(a: AuthzRole, b: AuthzRole): boolean {
  const pa = ROLE_PERMISSIONS[a];
  const pb = ROLE_PERMISSIONS[b];
  if (!pa || !pb) return false;
  for (const p of pb) {
    if (!pa.has(p)) return false;
  }
  return true;
}

/** Teaching-area roles (dashboard chips). */
export const TEACHING_ROLES: BindingRole[] = [...BINDING_ROLES];

/** Workspace admin-area roles. */
export const WORKSPACE_ADMIN_ROLES: BindingRole[] = ['owner', 'admin'];

/**
 * Map legacy AuthzAction strings to permissions for gradual call-site migration.
 * Prefer passing Permission directly.
 */
export type LegacyAuthzAction =
  | 'read'
  | 'write'
  | 'manage'
  | 'grade'
  | 'teach'
  | 'learn';

export function legacyActionToPermission(action: LegacyAuthzAction): Permission {
  switch (action) {
    case 'read':
      return 'content.read';
    case 'write':
    case 'teach':
      return 'content.write';
    case 'grade':
      return 'grade.write';
    case 'manage':
      return 'staff.manage';
    case 'learn':
      return 'student.submit';
    default:
      return 'content.read';
  }
}
