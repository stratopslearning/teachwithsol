/**
 * Value sets shared by the Drizzle schema, zod validators, UI and tests.
 *
 * This file has no imports so client components can use it without pulling
 * in the schema (drizzle-orm). `app/db/schema.ts` builds its text enums from
 * these tuples; everything else should import from here instead of retyping
 * the literals.
 */

/** `workspaces.type` — also the pricing SKU. */
export const WORKSPACE_TYPES = [
  'creator',
  'business',
  'department',
  'institution',
] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

/** `workspace_licenses.plan`. Same tiers as WORKSPACE_TYPES, but business → business_team. */
export const LICENSE_PLANS = [
  'creator',
  'business_team',
  'department',
  'institution',
] as const;
export type LicensePlan = (typeof LICENSE_PLANS)[number];

/** The license plan a workspace of this type gets by default. */
export function licensePlanForWorkspaceType(type: WorkspaceType): LicensePlan {
  return type === 'business' ? 'business_team' : type;
}

/** `role_bindings.role` — the source of authority. */
export const BINDING_ROLES = [
  'owner',
  'admin',
  'faculty',
  'lead_instructor',
  'co_instructor',
  'ta',
  'grader',
] as const;
export type BindingRole = (typeof BINDING_ROLES)[number];

/** Section-scoped teaching roles (subset of BINDING_ROLES). */
export const SECTION_TEACHING_ROLES = [
  'lead_instructor',
  'co_instructor',
  'ta',
  'grader',
] as const satisfies readonly BindingRole[];

/** `role_bindings.scope_type`. */
export const BINDING_SCOPE_TYPES = [
  'organization',
  'department',
  'offering',
  'section',
] as const;

/** `section_staff_invites.role` — roles a lead instructor can invite to a section. */
export const SECTION_STAFF_INVITE_ROLES = [
  'co_instructor',
  'ta',
  'grader',
] as const satisfies readonly BindingRole[];

/** Workspace roles an admin can invite or approve (`workspace_access_requests.claimed_role`). */
export const WORKSPACE_GRANTABLE_ROLES = ['instructor', 'admin'] as const;

/** `questions.type`. */
export const QUESTION_TYPES = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'SHORT_ANSWER',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** `outline_items.type` / authored activity kinds. */
export const OUTLINE_ITEM_TYPES = [
  'LESSON',
  'QUIZ',
  'DISCUSSION',
  'INTERACTIVE',
] as const;
export type OutlineItemType = (typeof OUTLINE_ITEM_TYPES)[number];

/** Ingest status for course materials, knowledge documents and hosted books. */
export const PROCESSING_STATUSES = [
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];
