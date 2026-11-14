/**
 * Faculty write helpers under FORCE RLS (drizzle/0071_faculty_write_definers.sql).
 * Callers must authorize() first. Prefer these over bare db.insert/update.
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

export type RoleBindingRow = {
  id: string;
  tenantId: string;
  userId: string;
  scopeType: string;
  scopeId: string;
  role: string;
  grantedBy: string | null;
  createdAt: Date;
  revokedAt: Date | null;
};

function mapBinding(r: {
  id: string;
  tenant_id: string;
  user_id: string;
  scope_type: string;
  scope_id: string;
  role: string;
  granted_by: string | null;
  created_at: Date | string;
  revoked_at: Date | string | null;
}): RoleBindingRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    scopeType: r.scope_type,
    scopeId: r.scope_id,
    role: r.role,
    grantedBy: r.granted_by,
    createdAt: asDate(r.created_at) ?? new Date(0),
    revokedAt: asDate(r.revoked_at),
  };
}

export async function listRoleBindingsAtUserScope(
  userId: string,
  scopeType: string,
  scopeId: string,
): Promise<RoleBindingRow[]> {
  const result = await db.execute(sql`
    SELECT * FROM sol_list_role_bindings_at_user_scope(
      ${userId}::uuid, ${scopeType}, ${scopeId}::uuid
    )
  `);
  return rowsFromExecute<Parameters<typeof mapBinding>[0]>(result).map(
    mapBinding,
  );
}

export async function findRoleBindingDefiner(opts: {
  tenantId: string;
  userId: string;
  scopeType: string;
  scopeId: string;
  role: string;
}): Promise<RoleBindingRow | null> {
  const result = await db.execute(sql`
    SELECT * FROM sol_find_role_binding(
      ${opts.tenantId}::uuid,
      ${opts.userId}::uuid,
      ${opts.scopeType},
      ${opts.scopeId}::uuid,
      ${opts.role}
    )
  `);
  const row = rowsFromExecute<Parameters<typeof mapBinding>[0]>(result)[0];
  return row ? mapBinding(row) : null;
}

export async function roleBindingByIdDefiner(
  bindingId: string,
): Promise<RoleBindingRow | null> {
  const result = await db.execute(sql`
    SELECT * FROM sol_role_binding_by_id(${bindingId}::uuid)
  `);
  const row = rowsFromExecute<Parameters<typeof mapBinding>[0]>(result)[0];
  return row ? mapBinding(row) : null;
}

export async function countActiveOwnersDefiner(
  tenantId: string,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_count_active_owners(${tenantId}::uuid) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function listActiveBindingsForScopeDefiner(opts: {
  tenantId: string;
  scopeType: string;
  scopeId: string;
}): Promise<RoleBindingRow[]> {
  const result = await db.execute(sql`
    SELECT * FROM sol_list_active_bindings_for_scope(
      ${opts.tenantId}::uuid, ${opts.scopeType}, ${opts.scopeId}::uuid
    )
  `);
  return rowsFromExecute<Parameters<typeof mapBinding>[0]>(result).map(
    mapBinding,
  );
}

export async function upsertRoleBindingDefiner(payload: {
  tenantId: string;
  userId: string;
  scopeType: string;
  scopeId: string;
  role: string;
  grantedBy?: string | null;
}): Promise<{ bindingId: string; created: boolean }> {
  const result = await db.execute(sql`
    SELECT sol_upsert_role_binding(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ bindingId: string; created: boolean }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.bindingId) {
    throw new Error('sol_upsert_role_binding returned no bindingId');
  }
  return { bindingId: parsed.bindingId, created: Boolean(parsed.created) };
}

export async function revokeRoleBindingDefiner(
  bindingId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_revoke_role_binding(${bindingId}::uuid)
  `);
}

export async function ensureOfferingDefiner(payload: {
  courseId: string;
  tenantId?: string | null;
  termLabel?: string | null;
  status?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<{
  id: string;
  courseId: string;
  tenantId: string | null;
  termLabel: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
}> {
  const result = await db.execute(sql`
    SELECT sol_ensure_offering(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{
    id: string;
    courseId: string;
    tenantId: string | null;
    termLabel: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
  }>(rowsFromExecute<{ row: unknown }>(result)[0]?.row);
  if (!parsed?.id) throw new Error('sol_ensure_offering returned no row');
  return {
    id: parsed.id,
    courseId: parsed.courseId,
    tenantId: parsed.tenantId,
    termLabel: parsed.termLabel,
    status: parsed.status,
    startsAt: asDate(parsed.startsAt),
    endsAt: asDate(parsed.endsAt),
  };
}

export async function syncCourseActivityDefiner(
  payload: Record<string, unknown>,
): Promise<{ id: string; courseId: string | null; type: string; title: string; isActive: boolean }> {
  const result = await db.execute(sql`
    SELECT sol_sync_course_activity(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{
    id: string;
    courseId: string | null;
    type: string;
    title: string;
    isActive: boolean;
  }>(rowsFromExecute<{ row: unknown }>(result)[0]?.row);
  if (!parsed?.id) throw new Error('sol_sync_course_activity returned no row');
  return parsed;
}

export async function softDeleteCourseActivityDefiner(
  payload: Record<string, unknown>,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_soft_delete_course_activity(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function setCourseActivityActiveDefiner(
  payload: Record<string, unknown>,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_set_course_activity_active(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function setSectionEndsAtDefiner(
  sectionId: string,
  endsAt: Date | null,
): Promise<{ id: string; endsAt: Date | null }> {
  const result = await db.execute(sql`
    SELECT sol_set_section_ends_at(
      ${sectionId}::uuid,
      ${endsAt ? endsAt.toISOString() : null}::timestamptz
    ) AS row
  `);
  const parsed = parseJsonb<{ id: string; endsAt: string | null }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_set_section_ends_at returned no row');
  return { id: parsed.id, endsAt: asDate(parsed.endsAt) };
}

export async function professorSectionEnrollDefiner(payload: {
  professorId: string;
  sectionId: string;
  /** Destination workspace/tenant — required for cross-workspace joins under FORCE RLS. */
  tenantId?: string;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_professor_section_enroll(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function professorSectionLeaveDefiner(
  professorId: string,
  sectionId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_professor_section_leave(${professorId}::uuid, ${sectionId}::uuid)
  `);
}

export async function professorSectionEnrollmentDefiner(
  professorId: string,
  sectionId: string,
): Promise<{ id: string; status: string } | null> {
  const result = await db.execute(sql`
    SELECT * FROM sol_professor_section_enrollment(
      ${professorId}::uuid, ${sectionId}::uuid
    )
  `);
  const row = rowsFromExecute<{ id: string; status: string }>(result)[0];
  return row ?? null;
}

export async function archiveQuizDefiner(quizId: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_archive_quiz(${quizId}::uuid) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_archive_quiz returned no id');
  return id;
}

export async function assignQuizSectionsDefiner(payload: {
  quizId: string;
  assignedBy: string;
  sectionIds: string[];
}): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT sol_assign_quiz_sections(${JSON.stringify(payload)}::jsonb) AS ids
  `);
  const ids = rowsFromExecute<{ ids: string[] | null }>(result)[0]?.ids;
  return ids ?? [];
}

export async function setInteractiveSectionsDefiner(payload: {
  interactiveId: string;
  assignedBy: string;
  sectionIds: string[];
}): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT sol_set_interactive_sections(${JSON.stringify(payload)}::jsonb) AS ids
  `);
  const ids = rowsFromExecute<{ ids: string[] | null }>(result)[0]?.ids;
  return ids ?? [];
}

export async function fetchInteractiveSectionIdsDefiner(
  interactiveId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT sol_interactive_section_ids(${interactiveId}::uuid) AS ids
  `);
  const ids = rowsFromExecute<{ ids: unknown }>(result)[0]?.ids;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id));
}

export async function assignLessonSectionsDefiner(payload: {
  lessonId: string;
  assignedBy: string;
  sectionIds: string[];
}): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT sol_assign_lesson_sections(${JSON.stringify(payload)}::jsonb) AS ids
  `);
  const ids = rowsFromExecute<{ ids: string[] | null }>(result)[0]?.ids;
  return ids ?? [];
}

export async function unassignQuizSectionDefiner(
  sectionId: string,
  quizId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_unassign_quiz_section(${sectionId}::uuid, ${quizId}::uuid)
  `);
}

export async function unassignChatbotSectionDefiner(
  sectionId: string,
  chatbotId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_unassign_chatbot_section(${sectionId}::uuid, ${chatbotId}::uuid)
  `);
}

export async function duplicateQuizDefiner(payload: {
  sourceQuizId: string;
  professorId: string;
  title?: string;
  sectionIds: string[];
}): Promise<{ id: string; title: string }> {
  const result = await db.execute(sql`
    SELECT sol_duplicate_quiz(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ id: string; title: string }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_duplicate_quiz returned no row');
  return parsed;
}

export async function createChatbotDefiner(
  payload: Record<string, unknown>,
): Promise<{ id: string; title: string }> {
  const result = await db.execute(sql`
    SELECT sol_create_chatbot(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ id: string; title: string }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_create_chatbot returned no row');
  return parsed;
}

export async function updateChatbotDefiner(
  payload: Record<string, unknown>,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_update_chatbot(${JSON.stringify(payload)}::jsonb) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_update_chatbot returned no id');
  return id;
}

export async function assignChatbotSectionsDefiner(payload: {
  chatbotId: string;
  assignedBy: string;
  sectionIds: string[];
}): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_assign_chatbot_sections(${JSON.stringify(payload)}::jsonb) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_assign_chatbot_sections returned no id');
  return id;
}

export async function duplicateChatbotDefiner(payload: {
  sourceChatbotId: string;
  professorId: string;
}): Promise<{ id: string; title: string }> {
  const result = await db.execute(sql`
    SELECT sol_duplicate_chatbot(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{ id: string; title: string }>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_duplicate_chatbot returned no row');
  return parsed;
}

export async function sectionCopyQuizDefiner(payload: {
  sourceQuizId: string;
  professorId: string;
  sectionIds: string[];
}): Promise<{ id: string; title: string; sectionIds: string[] }> {
  const result = await db.execute(sql`
    SELECT sol_section_copy_quiz(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{
    id: string;
    title: string;
    sectionIds?: string[];
  }>(rowsFromExecute<{ row: unknown }>(result)[0]?.row);
  if (!parsed?.id) throw new Error('sol_section_copy_quiz returned no row');
  return {
    id: parsed.id,
    title: parsed.title,
    sectionIds: Array.isArray(parsed.sectionIds)
      ? parsed.sectionIds.map(String)
      : payload.sectionIds,
  };
}

export async function createLessonDefiner(payload: {
  courseId: string;
  professorId: string;
  title: string;
  markdown: string;
  chapter?: import('@/app/db/schema').InteractiveChapterBody | null;
  isActive?: boolean;
  sourceOutlineItemId?: string | null;
  flashcards?: Array<{ front: string; back: string }>;
  /** Optional FORCE RLS hint — set before courses lookup in the DEFINER. */
  tenantId?: string | null;
}): Promise<{
  id: string;
  title: string;
  courseId: string;
  professorId: string;
  isActive: boolean;
  sourceOutlineItemId: string | null;
}> {
  const result = await db.execute(sql`
    SELECT sol_create_lesson(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<{
    id: string;
    title: string;
    courseId: string;
    professorId: string;
    isActive: boolean;
    sourceOutlineItemId?: string | null;
  }>(rowsFromExecute<{ row: unknown }>(result)[0]?.row);
  if (!parsed?.id) throw new Error('sol_create_lesson returned no row');
  return {
    id: parsed.id,
    title: parsed.title,
    courseId: parsed.courseId,
    professorId: parsed.professorId,
    isActive: Boolean(parsed.isActive),
    sourceOutlineItemId: parsed.sourceOutlineItemId ?? null,
  };
}

export async function createInteractiveDefiner(payload: {
  courseId: string;
  professorId: string;
  title: string;
  description?: string | null;
  kind: string;
  body?: Record<string, unknown>;
  isActive?: boolean;
  sourceOutlineItemId?: string | null;
  tenantId?: string | null;
}): Promise<{
  id: string;
  courseId: string;
  professorId: string | null;
  title: string;
  description: string | null;
  kind: import('@/app/db/schema').InteractiveKind;
  body: import('@/app/db/schema').InteractiveBody;
  packageStorageKey: string | null;
  isActive: boolean;
  sourceOutlineItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  tenantId: string | null;
  offeringId: string | null;
}> {
  const result = await db.execute(sql`
    SELECT sol_create_interactive(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) throw new Error('sol_create_interactive returned no row');
  const asDateLocal = (v: unknown) =>
    v == null ? null : v instanceof Date ? v : new Date(String(v));
  return {
    id: String(raw.id),
    courseId: String(raw.course_id ?? raw.courseId ?? payload.courseId),
    professorId: raw.professor_id
      ? String(raw.professor_id)
      : raw.professorId
        ? String(raw.professorId)
        : payload.professorId,
    title: String(raw.title ?? payload.title),
    description:
      raw.description != null
        ? String(raw.description)
        : payload.description ?? null,
    kind: String(raw.kind ?? payload.kind) as import('@/app/db/schema').InteractiveKind,
    body: (raw.body ?? payload.body ?? {}) as import('@/app/db/schema').InteractiveBody,
    packageStorageKey: raw.package_storage_key
      ? String(raw.package_storage_key)
      : raw.packageStorageKey
        ? String(raw.packageStorageKey)
        : null,
    isActive: Boolean(raw.is_active ?? raw.isActive ?? payload.isActive ?? false),
    sourceOutlineItemId: raw.source_outline_item_id
      ? String(raw.source_outline_item_id)
      : raw.sourceOutlineItemId
        ? String(raw.sourceOutlineItemId)
        : payload.sourceOutlineItemId ?? null,
    createdAt: asDateLocal(raw.created_at ?? raw.createdAt) ?? new Date(),
    updatedAt: asDateLocal(raw.updated_at ?? raw.updatedAt) ?? new Date(),
    deletedAt: asDateLocal(raw.deleted_at ?? raw.deletedAt),
    tenantId: raw.tenant_id
      ? String(raw.tenant_id)
      : raw.tenantId
        ? String(raw.tenantId)
        : null,
    offeringId: raw.offering_id
      ? String(raw.offering_id)
      : raw.offeringId
        ? String(raw.offeringId)
        : null,
  };
}

/** Seat-only membership upsert under FORCE RLS (0083). */
export async function ensureWorkspaceMembershipDefiner(payload: {
  workspaceId: string;
  userId: string;
  status?: 'active' | 'invited' | 'removed';
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_ensure_workspace_membership(${JSON.stringify(payload)}::jsonb)
  `);
}

export type UpsertStudentEnrollmentDefinerResult = {
  enrollmentId: string;
  created: boolean;
  reactivated: boolean;
  sources: Array<'lti' | 'code' | 'csv' | 'invite'>;
  tenantId: string | null;
  offeringId: string | null;
};

/** Student section + offering enroll under FORCE RLS (0083). */
export async function upsertStudentEnrollmentDefiner(payload: {
  studentId: string;
  sectionId: string;
  source: 'lti' | 'code' | 'csv' | 'invite';
  tenantId?: string | null;
  offeringId?: string | null;
  refuseCourseConflict?: boolean;
  bestEffortOfferingSync?: boolean;
}): Promise<UpsertStudentEnrollmentDefinerResult> {
  const result = await db.execute(sql`
    SELECT sol_upsert_student_enrollment(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<UpsertStudentEnrollmentDefinerResult>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.enrollmentId) {
    throw new Error('sol_upsert_student_enrollment returned no row');
  }
  return parsed;
}
