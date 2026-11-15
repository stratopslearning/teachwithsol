/**
 * SECURITY DEFINER write helpers for FORCE RLS paths (drizzle/0084).
 * Callers must authorize first. Prefer these over withTenant / bare drizzle.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';

function rowsFromExecute<T>(result: unknown): T[] {
  return (
    (result as { rows?: T[] }).rows ??
    (Array.isArray(result) ? (result as T[]) : [])
  );
}

function parseJsonb<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return raw as T;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export type GradeOverrideDefinerRow = {
  id: string;
  attemptId: string;
  tenantId: string;
  questionId: string | null;
  numericScore: number | null;
  criteriaOverrides: Record<string, boolean> | null;
  note: string;
  actorUserId: string;
  createdAt: Date;
};

function mapOverride(raw: Record<string, unknown>): GradeOverrideDefinerRow {
  return {
    id: String(raw.id),
    attemptId: String(raw.attemptId),
    tenantId: String(raw.tenantId),
    questionId: raw.questionId ? String(raw.questionId) : null,
    numericScore:
      raw.numericScore == null ? null : Number(raw.numericScore),
    criteriaOverrides:
      (raw.criteriaOverrides as Record<string, boolean> | null) ?? null,
    note: String(raw.note ?? ''),
    actorUserId: String(raw.actorUserId),
    createdAt: asDate(raw.createdAt as Date | string) ?? new Date(),
  };
}

export async function insertGradeOverrideDefiner(payload: {
  attemptId: string;
  tenantId: string;
  questionId?: string | null;
  numericScore?: number | null;
  criteriaOverrides?: Record<string, boolean> | null;
  note: string;
  actorUserId: string;
}): Promise<GradeOverrideDefinerRow> {
  const result = await db.execute(sql`
    SELECT sol_insert_grade_override(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_insert_grade_override returned no row');
  return mapOverride(parsed);
}

export async function listGradeOverridesDefiner(
  attemptId: string,
): Promise<GradeOverrideDefinerRow[]> {
  const result = await db.execute(sql`
    SELECT sol_list_grade_overrides(${attemptId}::uuid) AS rows
  `);
  const parsed = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (parsed ?? []).map(mapOverride);
}

export async function updateAttemptScoreDefiner(payload: {
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_update_attempt_score(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function setQuizGradesReleasedDefiner(
  quizId: string,
  gradesReleasedAt: Date | null,
): Promise<{ id: string; gradesReleasedAt: Date | null }> {
  const result = await db.execute(sql`
    SELECT sol_set_quiz_grades_released(
      ${quizId}::uuid,
      ${gradesReleasedAt ? gradesReleasedAt.toISOString() : null}::timestamptz
    ) AS row
  `);
  const parsed = parseJsonb<{ id: string; gradesReleasedAt: string | null }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) {
    throw new Error('sol_set_quiz_grades_released returned no row');
  }
  return {
    id: parsed.id,
    gradesReleasedAt: asDate(parsed.gradesReleasedAt),
  };
}

export async function createWorkspaceInviteDefiner(payload: {
  workspaceId: string;
  email: string;
  role: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<{ id: string; expiresAt: Date }> {
  const result = await db.execute(sql`
    SELECT sol_create_workspace_invite(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ id: string; expiresAt: string }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_create_workspace_invite returned no row');
  return {
    id: parsed.id,
    expiresAt: asDate(parsed.expiresAt) ?? new Date(payload.expiresAt),
  };
}

export async function createStudentInviteDefiner(payload: {
  tenantId: string;
  sectionId: string;
  email: string;
  tokenHash: string;
  invitedBy: string;
  expiresAt: string;
}): Promise<{ id: string; expiresAt: Date }> {
  const result = await db.execute(sql`
    SELECT sol_create_student_invite(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ id: string; expiresAt: string }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_create_student_invite returned no row');
  return {
    id: parsed.id,
    expiresAt: asDate(parsed.expiresAt) ?? new Date(payload.expiresAt),
  };
}

export async function createStaffInviteDefiner(payload: {
  tenantId: string;
  sectionId: string;
  email: string;
  role: 'co_instructor' | 'ta' | 'grader';
  tokenHash: string;
  grantedBy: string;
  expiresAt: string;
}): Promise<{ id: string; expiresAt: Date }> {
  const result = await db.execute(sql`
    SELECT sol_create_staff_invite(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ id: string; expiresAt: string }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_create_staff_invite returned no row');
  return {
    id: parsed.id,
    expiresAt: asDate(parsed.expiresAt) ?? new Date(payload.expiresAt),
  };
}

export async function dropStudentEnrollmentDefiner(
  enrollmentId: string,
): Promise<{
  id: string;
  studentId: string;
  sectionId: string;
  offeringId: string | null;
  tenantId: string | null;
}> {
  const result = await db.execute(sql`
    SELECT sol_drop_student_enrollment(${enrollmentId}::uuid) AS row
  `);
  const parsed = parseJsonb<{
    id: string;
    studentId: string;
    sectionId: string;
    offeringId: string | null;
    tenantId: string | null;
  }>(rowsFromExecute<{ row: unknown }>(result)[0]?.row);
  if (!parsed?.id) throw new Error('sol_drop_student_enrollment returned no row');
  return parsed;
}

export async function applyEnrollmentSourceRemovalDefiner(payload: {
  studentId: string;
  sectionId: string;
  source: string;
}): Promise<'dropped' | 'active' | 'missing'> {
  const result = await db.execute(sql`
    SELECT sol_apply_enrollment_source_removal(${JSON.stringify(payload)}::jsonb) AS status
  `);
  const status = rowsFromExecute<{ status: string }>(result)[0]?.status;
  if (status === 'dropped' || status === 'active' || status === 'missing') {
    return status;
  }
  throw new Error(`sol_apply_enrollment_source_removal returned ${status}`);
}

export async function linkCourseKnowledgeDefiner(payload: {
  courseId: string;
  documentId: string;
  tenantId: string;
  linkedByUserId: string;
  authoringCorpus?: 'prior_course' | 'this_term';
  pinnedVersionId?: string | null;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_link_course_knowledge(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function unlinkCourseKnowledgeDefiner(payload: {
  courseId: string;
  documentId: string;
  tenantId: string;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_unlink_course_knowledge(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function setCourseKnowledgeCorpusDefiner(payload: {
  courseId: string;
  documentId: string;
  tenantId: string;
  authoringCorpus: 'prior_course' | 'this_term';
}): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_set_course_knowledge_corpus(${JSON.stringify(payload)}::jsonb) AS n
  `);
  return Number(rowsFromExecute<{ n: number }>(result)[0]?.n ?? 0);
}

export async function acceptCourseKnowledgeUpdateDefiner(payload: {
  courseId: string;
  documentId: string;
  tenantId: string;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_accept_course_knowledge_update(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function dismissCourseKnowledgeUpdateDefiner(payload: {
  courseId: string;
  documentId: string;
  tenantId: string;
}): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_dismiss_course_knowledge_update(${JSON.stringify(payload)}::jsonb) AS n
  `);
  return Number(rowsFromExecute<{ n: number }>(result)[0]?.n ?? 0);
}

export async function notifyCourseKnowledgeVersionDefiner(
  documentId: string,
  newVersionId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_notify_course_knowledge_version(
      ${documentId}::uuid,
      ${newVersionId}::uuid
    )
  `);
}

export type AuthoringPolicyDefinerRow = {
  id: string;
  workspaceId: string;
  structureNotes: string | null;
  rubricStyle: string | null;
  tone: string | null;
  extraPrompt: string | null;
  updatedAt: Date;
};

function mapPolicy(raw: Record<string, unknown>): AuthoringPolicyDefinerRow {
  return {
    id: String(raw.id),
    workspaceId: String(raw.workspaceId),
    structureNotes: (raw.structureNotes as string | null) ?? null,
    rubricStyle: (raw.rubricStyle as string | null) ?? null,
    tone: (raw.tone as string | null) ?? null,
    extraPrompt: (raw.extraPrompt as string | null) ?? null,
    updatedAt: asDate(raw.updatedAt as Date | string) ?? new Date(),
  };
}

export async function getAuthoringPolicyDefiner(
  workspaceId: string,
): Promise<AuthoringPolicyDefinerRow | null> {
  const result = await db.execute(sql`
    SELECT sol_get_authoring_policy(${workspaceId}::uuid) AS row
  `);
  const parsed = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) return null;
  return mapPolicy(parsed);
}

export async function upsertAuthoringPolicyDefiner(payload: {
  workspaceId: string;
  structureNotes?: string | null;
  rubricStyle?: string | null;
  tone?: string | null;
  extraPrompt?: string | null;
}): Promise<AuthoringPolicyDefinerRow> {
  const result = await db.execute(sql`
    SELECT sol_upsert_authoring_policy(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_upsert_authoring_policy returned no row');
  return mapPolicy(parsed);
}

export async function restoreAuthoringSnapshotDefiner(payload: {
  outlineId: string;
  snapshot: unknown;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_restore_authoring_snapshot(${JSON.stringify(payload)}::jsonb)
  `);
}

export type AdminWorkspaceDeleteInfo = {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  parentWorkspaceId: string | null;
  childCount: number;
  activeCourseCount: number;
};

/**
 * Platform-staff workspace lookup for delete/PATCH under FORCE RLS.
 * Prefer owner-owned directory/fetch (BYPASSRLS) so sol_migrator-owned helpers
 * that lack BYPASSRLS cannot falsely 404.
 */
export async function adminWorkspaceDeleteInfoDefiner(
  workspaceId: string,
): Promise<AdminWorkspaceDeleteInfo | null> {
  // 1) Owner-owned provisioned fetch (BYPASSRLS) — authoritative existence.
  const fetched = await db.execute(sql`
    SELECT workspace FROM sol_fetch_provisioned_workspace(${workspaceId}::uuid)
  `);
  const wsRaw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ workspace: unknown }>(fetched)[0]?.workspace,
  );
  if (!wsRaw?.id) {
    // 2) Fallback: migrator-owned helper with tenant GUC pin.
    const result = await db.execute(sql`
      SELECT sol_admin_workspace_delete_info(${workspaceId}::uuid) AS row
    `);
    const parsed = parseJsonb<Record<string, unknown>>(
      rowsFromExecute<{ row: unknown }>(result)[0]?.row,
    );
    if (!parsed?.id) return null;
    return {
      id: String(parsed.id),
      slug: String(parsed.slug ?? ''),
      name: String(parsed.name ?? ''),
      type: String(parsed.type ?? ''),
      status: String(parsed.status ?? ''),
      parentWorkspaceId: parsed.parentWorkspaceId
        ? String(parsed.parentWorkspaceId)
        : null,
      childCount: Number(parsed.childCount ?? 0),
      activeCourseCount: Number(parsed.activeCourseCount ?? 0),
    };
  }

  // Accurate child/course counts from admin directory (also BYPASSRLS).
  let childCount = 0;
  let activeCourseCount = 0;
  try {
    const dir = await db.execute(sql`
      SELECT id, child_count, course_count
      FROM sol_admin_workspace_directory()
      WHERE id = ${workspaceId}::uuid
    `);
    const row = rowsFromExecute<{
      id: string;
      child_count: number | null;
      course_count: number | null;
    }>(dir)[0];
    if (row) {
      childCount = Number(row.child_count ?? 0);
      activeCourseCount = Number(row.course_count ?? 0);
    }
  } catch {
    // Directory unavailable — fall back to GUC-pinned helper counts.
    const result = await db.execute(sql`
      SELECT sol_admin_workspace_delete_info(${workspaceId}::uuid) AS row
    `);
    const parsed = parseJsonb<Record<string, unknown>>(
      rowsFromExecute<{ row: unknown }>(result)[0]?.row,
    );
    childCount = Number(parsed?.childCount ?? 0);
    activeCourseCount = Number(parsed?.activeCourseCount ?? 0);
  }

  return {
    id: String(wsRaw.id),
    slug: String(wsRaw.slug ?? ''),
    name: String(wsRaw.name ?? ''),
    type: String(wsRaw.type ?? ''),
    status: String(wsRaw.status ?? ''),
    parentWorkspaceId: wsRaw.parent_workspace_id
      ? String(wsRaw.parent_workspace_id)
      : null,
    childCount,
    activeCourseCount,
  };
}

export async function adminSoftDeleteWorkspaceDefiner(
  workspaceId: string,
): Promise<{ mode: 'soft'; workspaceId: string; courseCount: number }> {
  const result = await db.execute(sql`
    SELECT sol_admin_soft_delete_workspace(${workspaceId}::uuid) AS row
  `);
  const parsed = parseJsonb<{
    mode: 'soft';
    workspaceId: string;
    courseCount: number;
  }>(rowsFromExecute<{ row: unknown }>(result)[0]?.row);
  if (!parsed?.workspaceId) {
    throw new Error('sol_admin_soft_delete_workspace returned no row');
  }
  return {
    mode: 'soft',
    workspaceId: parsed.workspaceId,
    courseCount: Number(parsed.courseCount ?? 0),
  };
}

export async function adminHardDeleteWorkspaceDefiner(
  workspaceId: string,
): Promise<{ mode: 'hard'; workspaceId: string; deletedId: string }> {
  const result = await db.execute(sql`
    SELECT sol_admin_hard_delete_workspace(${workspaceId}::uuid) AS row
  `);
  const parsed = parseJsonb<{
    mode: 'hard';
    workspaceId: string;
    deletedId: string;
  }>(rowsFromExecute<{ row: unknown }>(result)[0]?.row);
  if (!parsed?.deletedId) {
    throw new Error('sol_admin_hard_delete_workspace returned no row');
  }
  return parsed;
}

export async function adminFetchCourseDefiner(
  courseId: string,
): Promise<Record<string, unknown> | null> {
  const result = await db.execute(sql`
    SELECT sol_admin_fetch_course(${courseId}::uuid) AS row
  `);
  return parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
}

export async function adminPurgeCourseDefiner(courseId: string): Promise<void> {
  await db.execute(sql`SELECT sol_admin_purge_course(${courseId}::uuid)`);
}

export async function adminFetchSectionDefiner(
  sectionId: string,
): Promise<Record<string, unknown> | null> {
  const result = await db.execute(sql`
    SELECT sol_admin_fetch_section(${sectionId}::uuid) AS row
  `);
  return parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
}

export async function adminPurgeSectionDefiner(sectionId: string): Promise<void> {
  await db.execute(sql`SELECT sol_admin_purge_section(${sectionId}::uuid)`);
}

export async function adminFetchQuizDefiner(
  quizId: string,
): Promise<Record<string, unknown> | null> {
  const result = await db.execute(sql`
    SELECT sol_admin_fetch_quiz(${quizId}::uuid) AS row
  `);
  return parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
}

export async function adminPurgeQuizDefiner(quizId: string): Promise<void> {
  await db.execute(sql`SELECT sol_admin_purge_quiz(${quizId}::uuid)`);
}

export async function adminReassignUserContentDefiner(
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_admin_reassign_user_content(
      ${fromUserId}::uuid,
      ${toUserId}::uuid
    )
  `);
}

export async function adminDeleteUserDefiner(userId: string): Promise<void> {
  await db.execute(sql`SELECT sol_admin_delete_user(${userId}::uuid)`);
}

export async function createAccessRequestDefiner(payload: {
  workspaceId: string;
  email: string;
  name?: string | null;
  claimedRole?: string;
  userId?: string | null;
}): Promise<{ id: string }> {
  const result = await db.execute(sql`
    SELECT sol_create_access_request(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ id: string }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_create_access_request returned no id');
  return parsed;
}

export async function listPendingAccessRequestsDefiner(
  workspaceId: string,
): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`
    SELECT sol_list_pending_access_requests(${workspaceId}::uuid) AS rows
  `);
  return (
    parseJsonb<Record<string, unknown>[]>(
      rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
    ) ?? []
  );
}

export async function fetchAccessRequestDefiner(payload: {
  requestId: string;
  workspaceId: string;
}): Promise<Record<string, unknown> | null> {
  const result = await db.execute(sql`
    SELECT sol_fetch_access_request(${JSON.stringify(payload)}::jsonb) AS row
  `);
  return parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
}

export async function decideAccessRequestDefiner(payload: {
  requestId: string;
  workspaceId: string;
  status: 'approved' | 'rejected' | 'blocked';
  decidedBy: string;
  note?: string | null;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_decide_access_request(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function findWorkspaceIdBySlugDefiner(
  slug: string,
): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT sol_find_workspace_id_by_slug(${slug}) AS id
  `);
  return rowsFromExecute<{ id: string | null }>(result)[0]?.id ?? null;
}

export async function grantWorkspaceCompAccessDefiner(payload: {
  workspaceId: string;
  days?: number;
  indefinite?: boolean;
}): Promise<{ periodStart: Date; periodEnd: Date | null }> {
  const result = await db.execute(sql`
    SELECT sol_grant_workspace_comp_access(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ periodStart: string; periodEnd: string | null }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.periodStart) {
    throw new Error('sol_grant_workspace_comp_access returned no row');
  }
  return {
    periodStart: asDate(parsed.periodStart) ?? new Date(),
    periodEnd: asDate(parsed.periodEnd),
  };
}

export async function revokeWorkspaceCompAccessDefiner(
  workspaceId: string,
): Promise<{ revokedAt: Date }> {
  const result = await db.execute(sql`
    SELECT sol_revoke_workspace_comp_access(${workspaceId}::uuid) AS row
  `);
  const parsed = parseJsonb<{ revokedAt: string }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.revokedAt) {
    throw new Error('sol_revoke_workspace_comp_access returned no row');
  }
  return { revokedAt: asDate(parsed.revokedAt) ?? new Date() };
}
