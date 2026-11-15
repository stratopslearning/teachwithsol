export {
  authorize,
  clearBindingCache,
  listBindingsForUser,
  tenantIdForCourse,
  tenantIdForOffering,
  tenantIdForSection,
  userHasAnyBinding,
  type AuthzAction,
  type AuthzGrantRole,
  type AuthzResource,
  type AuthzScopeType,
} from '@/lib/authz/authorize';
export {
  upsertRoleBinding,
  revokeRoleBinding,
  revokeRoleBindingMatching,
  listActiveBindingsForScope,
} from '@/lib/authz/bindings';
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  TEACHING_ROLES,
  WORKSPACE_ADMIN_ROLES,
  roleHasPermission,
  isStudentPermission,
  legacyActionToPermission,
  type Permission,
  type BindingRole,
  type AuthzRole,
  type LegacyAuthzAction,
} from '@/lib/authz/permissions';
export {
  adminHasTenantDataAccess,
  hasActiveSupportAccess,
  platformStaffHasTenantDataAccess,
} from '@/lib/authz/supportAccess';
export {
  requireSupportGrant,
  ADMIN_METADATA_ONLY_ROUTES,
} from '@/lib/authz/requireSupportGrant';
export {
  grantOfferingStaff,
  grantSectionStaff,
  revokeStaffGrant,
  listActiveStaffGrantsForScope,
  isStaffGrantRole,
  type StaffGrantRole,
  type SectionStaffInviteRole,
} from '@/lib/authz/staffGrants';
export {
  getDashboardAreas,
  requireTeachingAccess,
  requireLearningAccess,
  requireWorkspaceAdminAccess,
  requirePlatformStaff,
  userCanAccessTeachingArea,
  userCanAccessLearningArea,
  userMayUsePreEnrollStudentApi,
  listBoundWorkspaceIds,
} from '@/lib/authz/gates';
export { transferWorkspaceOwnership } from '@/lib/authz/ownership';
export {
  createSectionStaffInvite,
  claimSectionStaffInvite,
  peekSectionStaffInvite,
  isSectionStaffInviteRole,
} from '@/lib/authz/staffInvites';
