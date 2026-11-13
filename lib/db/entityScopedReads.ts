/**
 * Entity resolve reads under FORCE RLS without app.tenant_id.
 * Backed by drizzle/0052_entity_resolve_read.sql.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { asUuidArray } from '@/lib/db/sqlArrays';

function rowsFromExecute<T>(result: unknown): T[] {
  return (
    (result as { rows?: T[] }).rows ??
    (Array.isArray(result) ? (result as T[]) : [])
  );
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export async function fetchCourseById(courseId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_course_by_id(${courseId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    title: string;
    description: string | null;
    workspace_id: string;
    tenant_id: string;
    status: string;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    workspaceId: r.workspace_id,
    tenantId: r.tenant_id,
    status: r.status,
  };
}

export async function fetchSectionById(sectionId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_section_by_id(${sectionId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    course_id: string;
    offering_id: string | null;
    workspace_id: string | null;
    tenant_id: string | null;
    name: string;
    professor_enrollment_code: string;
    student_enrollment_code: string;
    is_active: boolean;
    ends_at: Date | string | null;
    deleted_at: Date | string | null;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    courseId: r.course_id,
    offeringId: r.offering_id,
    workspaceId: r.workspace_id,
    tenantId: r.tenant_id,
    name: r.name,
    professorEnrollmentCode: r.professor_enrollment_code,
    studentEnrollmentCode: r.student_enrollment_code,
    isActive: r.is_active,
    endsAt: asDate(r.ends_at),
    deletedAt: asDate(r.deleted_at),
  };
}

export async function fetchOfferingIdsForCourse(
  courseId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT id FROM sol_offering_ids_for_course(${courseId}::uuid)
  `);
  return rowsFromExecute<{ id: string }>(result).map((r) => r.id);
}

export async function fetchSectionRowsForCourse(courseId: string) {
  const result = await db.execute(sql`
    SELECT id, offering_id FROM sol_section_rows_for_course(${courseId}::uuid)
  `);
  return rowsFromExecute<{ id: string; offering_id: string | null }>(result).map(
    (r) => ({ id: r.id, offeringId: r.offering_id }),
  );
}

/** Course Assignments hub rows + section labels — SECURITY DEFINER. */
export async function fetchCourseActivitiesDefiner(courseId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_list_course_activities(${courseId}::uuid)
  `);
  return rowsFromExecute<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    course_id: string | null;
    course_title: string | null;
    professor_id: string;
    is_active: boolean;
    start_date: Date | string | null;
    end_date: Date | string | null;
    position: number;
    quiz_id: string | null;
    lesson_id: string | null;
    chatbot_id: string | null;
    interactive_id: string | null;
    interactive_kind: string | null;
    section_ids: string[] | null;
    section_names: string[] | null;
    updated_at: Date | string;
  }>(result).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    courseId: r.course_id,
    courseTitle: r.course_title,
    professorId: r.professor_id,
    isActive: Boolean(r.is_active),
    startDate: asDate(r.start_date),
    endDate: asDate(r.end_date),
    position: Number(r.position ?? 0),
    quizId: r.quiz_id,
    lessonId: r.lesson_id,
    chatbotId: r.chatbot_id,
    interactiveId: r.interactive_id,
    interactiveKind: r.interactive_kind,
    sectionIds: Array.isArray(r.section_ids) ? r.section_ids : [],
    sectionNames: Array.isArray(r.section_names) ? r.section_names : [],
    updatedAt: asDate(r.updated_at) ?? new Date(),
  }));
}

export async function fetchSectionIdsForOfferings(
  offeringIds: string[],
): Promise<string[]> {
  if (offeringIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT id FROM sol_section_ids_for_offerings(${asUuidArray(offeringIds)})
  `);
  return rowsFromExecute<{ id: string }>(result).map((r) => r.id);
}

export async function fetchQuizById(quizId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_quiz_by_id(${quizId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    title: string;
    professor_id: string | null;
    tenant_id: string | null;
    offering_id: string | null;
    end_date: Date | string | null;
    description: string | null;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    professorId: r.professor_id,
    tenantId: r.tenant_id,
    offeringId: r.offering_id,
    endDate: asDate(r.end_date),
    description: r.description,
  };
}

export async function fetchQuizSectionIds(quizId: string): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT section_id FROM sol_quiz_section_ids(${quizId}::uuid)
  `);
  return rowsFromExecute<{ section_id: string }>(result).map(
    (r) => r.section_id,
  );
}

export async function fetchUserHasSupportAccess(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT sol_user_has_support_access(
      ${userId}::uuid,
      ${tenantId}::uuid
    ) AS ok
  `);
  return Boolean(rowsFromExecute<{ ok: boolean }>(result)[0]?.ok);
}

export async function fetchUserTeachingSectionIds(
  userId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT section_id FROM sol_user_teaching_section_ids(${userId}::uuid)
  `);
  return rowsFromExecute<{ section_id: string }>(result).map(
    (r) => r.section_id,
  );
}

export async function fetchCourseHubMeta(courseId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_course_hub_meta(${courseId}::uuid)
  `);
  const r = rowsFromExecute<{
    description: string | null;
    ai_policy: unknown;
    section_count: number;
    material_count: number;
    ready_count: number;
  }>(result)[0];
  if (!r) return null;
  return {
    description: r.description,
    aiPolicy: r.ai_policy,
    sectionCount: Number(r.section_count ?? 0),
    materialCount: Number(r.material_count ?? 0),
    readyCount: Number(r.ready_count ?? 0),
  };
}

export async function fetchCourseLinkedDocuments(courseId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_course_linked_documents(${courseId}::uuid)
  `);
  return rowsFromExecute<{
    id: string;
    workspace_id: string;
    title: string;
    source_kind: string;
    mime_type: string | null;
    byte_size: number | null;
    status: string;
    error_message: string | null;
    external_url: string | null;
    connector_id: string | null;
    current_version_id: string | null;
    visibility: string;
    created_by_user_id: string | null;
    authoring_corpus: string;
    pinned_version_id: string | null;
    update_available_version_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(result).map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    sourceKind: r.source_kind as 'UPLOAD' | 'URL' | 'CONNECTOR',
    mimeType: r.mime_type,
    byteSize: r.byte_size,
    status: r.status as 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED',
    errorMessage: r.error_message,
    externalUrl: r.external_url,
    connectorId: r.connector_id,
    currentVersionId: r.current_version_id,
    visibility: (r.visibility as 'personal' | 'workspace') ?? 'workspace',
    createdByUserId: r.created_by_user_id,
    authoringCorpus:
      (r.authoring_corpus as 'prior_course' | 'this_term') ?? 'this_term',
    pinnedVersionId: r.pinned_version_id,
    updateAvailableVersionId: r.update_available_version_id,
    createdAt: asDate(r.created_at)!,
    updatedAt: asDate(r.updated_at)!,
  }));
}

export async function fetchWorkspaceDocumentsDefiner(
  workspaceId: string,
  userId: string,
  coordinator: boolean,
) {
  const result = await db.execute(sql`
    SELECT * FROM sol_workspace_documents(
      ${workspaceId}::uuid,
      ${userId}::uuid,
      ${coordinator}::boolean
    )
  `);
  return rowsFromExecute<{
    id: string;
    workspace_id: string;
    title: string;
    source_kind: string;
    mime_type: string | null;
    byte_size: number | null;
    status: string;
    error_message: string | null;
    external_url: string | null;
    connector_id: string | null;
    current_version_id: string | null;
    visibility: string;
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(result).map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    sourceKind: r.source_kind as 'UPLOAD' | 'URL' | 'CONNECTOR',
    mimeType: r.mime_type,
    byteSize: r.byte_size,
    status: r.status as 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED',
    errorMessage: r.error_message,
    externalUrl: r.external_url,
    connectorId: r.connector_id,
    currentVersionId: r.current_version_id,
    visibility: (r.visibility as 'personal' | 'workspace') ?? 'workspace',
    createdByUserId: r.created_by_user_id,
    createdAt: asDate(r.created_at)!,
    updatedAt: asDate(r.updated_at)!,
  }));
}

export async function fetchCourseAuthoringMaterialStats(courseId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_course_authoring_material_stats(${courseId}::uuid)
  `);
  const r = rowsFromExecute<{
    ready_count: number;
    prior_tagged_count: number;
    this_term_tagged_count: number;
  }>(result)[0];
  return {
    readyCount: Number(r?.ready_count ?? 0),
    priorTaggedCount: Number(r?.prior_tagged_count ?? 0),
    thisTermTaggedCount: Number(r?.this_term_tagged_count ?? 0),
    hasPriorCorpus: Number(r?.prior_tagged_count ?? 0) > 0,
  };
}

/** Authoring revision resolve — SECURITY DEFINER, no tenant GUC. */
export async function fetchAuthoringRevisionById(revisionId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_authoring_revision_by_id(${revisionId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    outline_id: string;
    label: string;
    snapshot: unknown;
    tenant_id: string | null;
    created_by_user_id: string | null;
    created_at: Date | string;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    outlineId: r.outline_id,
    label: r.label,
    snapshot: r.snapshot,
    tenantId: r.tenant_id,
    createdByUserId: r.created_by_user_id,
    createdAt: asDate(r.created_at)!,
  };
}

/** Outline item access resolve — SECURITY DEFINER, no tenant GUC. */
export async function fetchOutlineItemById(itemId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_outline_item_by_id(${itemId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    module_id: string;
    outline_id: string;
    course_id: string;
    tenant_id: string | null;
    type: string;
    title: string;
    status: string;
    deleted_at: Date | string | null;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    moduleId: r.module_id,
    outlineId: r.outline_id,
    courseId: r.course_id,
    tenantId: r.tenant_id,
    type: r.type,
    title: r.title,
    status: r.status,
    deletedAt: asDate(r.deleted_at),
  };
}

/** Persist outline tree (archive prior + insert) — SECURITY DEFINER, no tenant GUC. */
export async function persistCourseOutlineDefiner(payload: {
  tenantId: string;
  courseId: string;
  createdByUserId: string;
  title: string;
  status?: string;
  brief?: string | null;
  hasPriorCorpus?: boolean;
  bodiesBuilt?: boolean;
  userMessage?: string;
  assistantMessage?: string;
  modules: Array<{
    title: string;
    summary?: string | null;
    items: Array<{
      type: string;
      title: string;
      body?: unknown;
      sourceMaterialIds?: string[];
    }>;
  }>;
}): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_persist_course_outline(${JSON.stringify(payload)}::jsonb) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_persist_course_outline returned no id');
  return id;
}

/** Apply faithful-build item patches — SECURITY DEFINER, no tenant GUC. */
export async function applyOutlineBuildDefiner(opts: {
  outlineId: string;
  patches: Array<{
    itemId: string;
    title?: string;
    body: unknown;
    sourceMaterialIds?: string[];
  }>;
  hasPriorCorpus?: boolean;
  aiMeta?: Record<string, unknown>;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_apply_outline_build(
      ${opts.outlineId}::uuid,
      ${JSON.stringify(opts.patches)}::jsonb,
      ${Boolean(opts.hasPriorCorpus)}::boolean,
      ${JSON.stringify(opts.aiMeta ?? {})}::jsonb
    )
  `);
}

/** Insert authoring revision — SECURITY DEFINER, no tenant GUC. */
export async function insertAuthoringRevisionDefiner(opts: {
  outlineId: string;
  tenantId: string | null;
  userId: string;
  label: string;
  snapshot: unknown;
}): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_insert_authoring_revision(
      ${opts.outlineId}::uuid,
      ${opts.tenantId ?? null}::uuid,
      ${opts.userId}::uuid,
      ${opts.label},
      ${JSON.stringify(opts.snapshot)}::jsonb
    ) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_insert_authoring_revision returned no id');
  return id;
}

/** Outlines for a course (session list) — SECURITY DEFINER, no tenant GUC. */
export async function fetchOutlinesForCourse(
  courseId: string,
  opts?: { includeArchived?: boolean },
) {
  const includeArchived = Boolean(opts?.includeArchived);
  const result = await db.execute(sql`
    SELECT * FROM sol_outlines_for_course(
      ${courseId}::uuid,
      ${includeArchived}::boolean
    )
  `);
  return rowsFromExecute<{
    id: string;
    course_id: string;
    tenant_id: string | null;
    title: string;
    status: string;
    brief: string | null;
    has_prior_corpus: boolean;
    bodies_built: boolean;
    preview: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(result).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    tenantId: r.tenant_id,
    title: r.title,
    status: r.status,
    brief: r.brief,
    hasPriorCorpus: Boolean(r.has_prior_corpus),
    bodiesBuilt: Boolean(r.bodies_built),
    preview: r.preview,
    createdAt: asDate(r.created_at)!,
    updatedAt: asDate(r.updated_at)!,
  }));
}

/** Authoring chat messages for an outline — SECURITY DEFINER. */
export async function fetchAuthoringMessagesForOutline(
  outlineId: string,
  limit = 40,
) {
  const result = await db.execute(sql`
    SELECT * FROM sol_authoring_messages_for_outline(
      ${outlineId}::uuid,
      ${Math.max(limit, 1)}::integer
    )
  `);
  return rowsFromExecute<{
    id: string;
    outline_id: string;
    role: string;
    content: string;
    created_at: Date | string;
  }>(result).map((r) => ({
    id: r.id,
    outlineId: r.outline_id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    createdAt: asDate(r.created_at)!,
  }));
}

/** Full outline tree (modules + items) — SECURITY DEFINER JSON. */
export async function fetchOutlineTreeById(outlineId: string) {
  const result = await db.execute(sql`
    SELECT sol_outline_tree_by_id(${outlineId}::uuid) AS tree
  `);
  const row = rowsFromExecute<{ tree: unknown }>(result)[0];
  if (!row?.tree) return null;
  return row.tree as {
    id: string;
    courseId: string;
    tenantId: string | null;
    title: string;
    status: string;
    brief: string | null;
    hasPriorCorpus: boolean;
    bodiesBuilt: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
    modules: Array<{
      id: string;
      title: string;
      summary: string | null;
      position: number;
      items: Array<{
        id: string;
        moduleId: string;
        type: string;
        title: string;
        status: string;
        body: unknown;
        sourceMaterialIds?: string[];
        variantOfItemId?: string | null;
        faithfulBody?: unknown;
        publishedQuizId?: string | null;
        publishedChatbotId?: string | null;
        publishedLessonId?: string | null;
        publishedInteractiveId?: string | null;
        position: number;
        reviewFlags?: unknown;
        reviewStatus?: string;
      }>;
    }>;
  };
}

/** Course outline header — SECURITY DEFINER, no tenant GUC. */
export async function fetchOutlineById(outlineId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_outline_by_id(${outlineId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    course_id: string;
    tenant_id: string | null;
    created_by_user_id: string;
    title: string;
    status: string;
    brief: string | null;
    has_prior_corpus: boolean;
    bodies_built: boolean;
    deleted_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    courseId: r.course_id,
    tenantId: r.tenant_id,
    createdByUserId: r.created_by_user_id,
    title: r.title,
    status: r.status,
    brief: r.brief,
    hasPriorCorpus: Boolean(r.has_prior_corpus),
    bodiesBuilt: Boolean(r.bodies_built),
    deletedAt: asDate(r.deleted_at),
    createdAt: asDate(r.created_at)!,
    updatedAt: asDate(r.updated_at)!,
  };
}

/** Pinned knowledge chunks for authoring — SECURITY DEFINER, no tenant GUC. */
export async function fetchCourseAuthoringChunks(
  courseId: string,
  opts?: { limit?: number; focusIds?: string[] },
) {
  const limit = Math.max(opts?.limit ?? 24, 1);
  const focusIds = (opts?.focusIds ?? []).filter(Boolean);
  const result = await db.execute(sql`
    SELECT * FROM sol_course_authoring_chunks_v2(
      ${courseId}::uuid,
      ${limit}::integer,
      ${focusIds.length > 0 ? asUuidArray(focusIds) : sql`NULL::uuid[]`}
    )
  `);
  return rowsFromExecute<{
    id: string;
    material_id: string;
    content: string;
    title: string;
    origin: string;
    version_id: string | null;
  }>(result).map((r) => ({
    id: String(r.id),
    materialId: String(r.material_id),
    content: String(r.content ?? ''),
    distance: 0,
    title: String(r.title || 'Untitled'),
    origin: (r.origin === 'shared' ? 'shared' : 'course') as 'shared' | 'course',
    versionId: r.version_id ? String(r.version_id) : null,
  }));
}

export async function fetchCourseMaterialsList(courseId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_course_materials_list(${courseId}::uuid)
  `);
  return rowsFromExecute<{
    id: string;
    course_id: string;
    title: string;
    source_type: string;
    mime_type: string | null;
    byte_size: number | null;
    status: string;
    error_message: string | null;
    external_url: string | null;
    authoring_corpus: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(result).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    title: r.title,
    sourceType: r.source_type as 'UPLOAD' | 'URL',
    mimeType: r.mime_type,
    byteSize: r.byte_size,
    status: r.status as 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED',
    errorMessage: r.error_message,
    externalUrl: r.external_url,
    authoringCorpus: (r.authoring_corpus as 'prior_course' | 'this_term') ?? 'this_term',
    createdAt: asDate(r.created_at)!,
    updatedAt: asDate(r.updated_at)!,
  }));
}

export async function fetchSectionsByIds(sectionIds: string[]) {
  if (sectionIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT * FROM sol_sections_by_ids(${asUuidArray(sectionIds)})
  `);
  return rowsFromExecute<{
    id: string;
    course_id: string;
    offering_id: string | null;
    workspace_id: string | null;
    tenant_id: string | null;
    name: string;
    professor_enrollment_code: string;
    student_enrollment_code: string;
    is_active: boolean;
    ends_at: Date | string | null;
    course_title: string;
    course_workspace_id: string;
  }>(result).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    offeringId: r.offering_id,
    workspaceId: r.workspace_id,
    tenantId: r.tenant_id,
    name: r.name,
    professorEnrollmentCode: r.professor_enrollment_code,
    studentEnrollmentCode: r.student_enrollment_code,
    isActive: r.is_active,
    endsAt: asDate(r.ends_at),
    course: {
      id: r.course_id,
      title: r.course_title,
      workspaceId: r.course_workspace_id,
    },
  }));
}

/** Single knowledge document resolve — SECURITY DEFINER, no tenant GUC. */
export async function fetchKnowledgeDocumentById(documentId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_knowledge_document_by_id(${documentId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    workspace_id: string;
    title: string;
    visibility: string;
    created_by_user_id: string | null;
    deleted_at: Date | string | null;
    current_version_id: string | null;
    status: string;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    visibility: (r.visibility as 'personal' | 'workspace') ?? 'workspace',
    createdByUserId: r.created_by_user_id,
    deletedAt: asDate(r.deleted_at),
    currentVersionId: r.current_version_id,
    status: r.status,
  };
}

/** Version history for a knowledge document — SECURITY DEFINER. */
export async function fetchKnowledgeDocumentVersions(documentId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_knowledge_document_versions(${documentId}::uuid)
  `);
  return rowsFromExecute<{
    id: string;
    version: number;
    ocr_used: boolean;
    char_count: number | null;
    created_at: Date | string;
  }>(result).map((r) => ({
    id: r.id,
    version: r.version,
    ocrUsed: r.ocr_used,
    charCount: r.char_count,
    createdAt: asDate(r.created_at)!,
  }));
}

/** Append authoring chat messages — SECURITY DEFINER. */
export async function insertAuthoringMessagesDefiner(opts: {
  outlineId: string;
  tenantId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_insert_authoring_messages(
      ${opts.outlineId}::uuid,
      ${opts.tenantId}::uuid,
      ${JSON.stringify(opts.messages)}::jsonb
    )
  `);
}

/** Quiz version snapshot insert — SECURITY DEFINER. */
export async function createQuizVersionSnapshotDefiner(opts: {
  quizId: string;
  createdByUserId?: string | null;
}): Promise<{ id: string; version: number }> {
  const result = await db.execute(sql`
    SELECT * FROM sol_create_quiz_version_snapshot(
      ${opts.quizId}::uuid,
      ${opts.createdByUserId ?? null}::uuid
    )
  `);
  const row = rowsFromExecute<{ id: string; version: number }>(result)[0];
  if (!row) {
    throw new Error('sol_create_quiz_version_snapshot returned no row');
  }
  return { id: row.id, version: Number(row.version) };
}

/** Mark outline item published + link artifact ids — SECURITY DEFINER. */
export async function markOutlineItemPublishedDefiner(opts: {
  itemId: string;
  publishedQuizId?: string | null;
  publishedChatbotId?: string | null;
  publishedLessonId?: string | null;
  publishedInteractiveId?: string | null;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_mark_outline_item_published(
      ${opts.itemId}::uuid,
      ${opts.publishedQuizId ?? null}::uuid,
      ${opts.publishedChatbotId ?? null}::uuid,
      ${opts.publishedLessonId ?? null}::uuid,
      ${opts.publishedInteractiveId ?? null}::uuid
    )
  `);
}

/** Create knowledge_documents row — SECURITY DEFINER. */
export async function createKnowledgeDocumentDefiner(payload: {
  workspaceId: string;
  title: string;
  sourceKind: 'UPLOAD' | 'URL' | 'CONNECTOR';
  visibility: 'personal' | 'workspace';
  createdByUserId: string;
  mimeType?: string | null;
  byteSize?: number | null;
  externalUrl?: string | null;
}): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_create_knowledge_document(${JSON.stringify(payload)}::jsonb) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_create_knowledge_document returned no id');
  return id;
}

/** Add knowledge version + point current — SECURITY DEFINER. */
export async function addKnowledgeDocumentVersionDefiner(payload: {
  documentId: string;
  version: number;
  createdByUserId: string;
  s3Key?: string | null;
  checksum?: string | null;
  byteSize?: number | null;
  mimeType?: string | null;
}): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_add_knowledge_document_version(${JSON.stringify(payload)}::jsonb) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_add_knowledge_document_version returned no id');
  return id;
}

export async function setKnowledgeDocumentVisibilityDefiner(
  documentId: string,
  visibility: 'personal' | 'workspace',
): Promise<void> {
  await db.execute(sql`
    SELECT sol_set_knowledge_document_visibility(
      ${documentId}::uuid,
      ${visibility}::text
    )
  `);
}

export async function softDeleteKnowledgeDocumentDefiner(
  documentId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_soft_delete_knowledge_document(${documentId}::uuid)
  `);
}

export async function setKnowledgeDocumentTitleDefiner(
  documentId: string,
  title: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_set_knowledge_document_title(
      ${documentId}::uuid,
      ${title}::text
    )
  `);
}

/** Create course + default offering + optional lead bind — SECURITY DEFINER. */
export async function createCourseDefiner(payload: {
  workspaceId: string;
  title: string;
  description?: string | null;
  createdByUserId?: string | null;
  bindCreator?: boolean;
}): Promise<{
  id: string;
  workspaceId: string;
  tenantId: string | null;
  title: string;
  description: string | null;
  status: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  offeringId: string | null;
}> {
  const result = await db.execute(sql`
    SELECT sol_create_course(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = rowsFromExecute<{ row: unknown }>(result)[0]?.row;
  const row =
    typeof raw === 'string'
      ? (JSON.parse(raw) as Record<string, unknown>)
      : (raw as Record<string, unknown> | undefined);
  if (!row?.id) throw new Error('sol_create_course returned no row');
  return {
    id: String(row.id),
    workspaceId: String(row.workspaceId ?? payload.workspaceId),
    tenantId: (row.tenantId as string | null) ?? payload.workspaceId,
    title: String(row.title ?? payload.title),
    description: (row.description as string | null) ?? null,
    status: String(row.status ?? 'ACTIVE'),
    isActive: Boolean(row.isActive ?? true),
    createdAt: asDate(row.createdAt as Date | string | null | undefined) ?? new Date(),
    updatedAt: asDate(row.updatedAt as Date | string | null | undefined) ?? new Date(),
    offeringId: row.offeringId ? String(row.offeringId) : null,
  };
}

/** Create section + default offering + optional lead bind — SECURITY DEFINER. */
export async function createSectionDefiner(payload: {
  courseId: string;
  name: string;
  professorEnrollmentCode: string;
  studentEnrollmentCode: string;
  createdByUserId?: string | null;
  endsAt?: string | null;
  bindCreator?: boolean;
}): Promise<{
  id: string;
  name: string;
  courseId: string;
  professorEnrollmentCode: string;
  studentEnrollmentCode: string;
  endsAt: Date | null;
  createdAt: Date;
}> {
  const result = await db.execute(sql`
    SELECT sol_create_section(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = rowsFromExecute<{ row: unknown }>(result)[0]?.row;
  const row =
    typeof raw === 'string'
      ? (JSON.parse(raw) as Record<string, unknown>)
      : (raw as Record<string, unknown> | undefined);
  if (!row?.id) throw new Error('sol_create_section returned no row');
  return {
    id: String(row.id),
    name: String(row.name ?? payload.name),
    courseId: String(row.courseId ?? payload.courseId),
    professorEnrollmentCode: String(
      row.professorEnrollmentCode ?? payload.professorEnrollmentCode,
    ),
    studentEnrollmentCode: String(
      row.studentEnrollmentCode ?? payload.studentEnrollmentCode,
    ),
    endsAt: asDate(row.endsAt as Date | string | null | undefined),
    createdAt: asDate(row.createdAt as Date | string | null | undefined) ?? new Date(),
  };
}

/** Flip quiz + course_activities is_active — SECURITY DEFINER. */
export async function setQuizVisibilityDefiner(
  quizId: string,
  isActive: boolean,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_set_quiz_visibility(
      ${quizId}::uuid,
      ${isActive}::boolean
    ) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_set_quiz_visibility returned no id');
  return id;
}

/** Update quiz + questions + sections + activity — SECURITY DEFINER. */
export async function updateQuizDefiner(payload: {
  quizId: string;
  title: string;
  description?: string | null;
  maxAttempts: number;
  timeLimit?: number | null;
  passingScore: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  assignedBy: string;
  sectionIds: string[];
  questions: Array<{
    id?: string;
    type: string;
    question: string;
    options?: unknown;
    correctAnswer?: string | null;
    points: number;
    order: number;
    conceptTags?: string[];
  }>;
}): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_update_quiz(${JSON.stringify(payload)}::jsonb) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_update_quiz returned no id');
  return id;
}

/**
 * Insert quiz + questions + quiz_sections + course_activities — SECURITY DEFINER.
 * Avoids Neon WS/GUC flakes that break quizzes RLS WITH CHECK.
 */
export async function createQuizDefiner(payload: {
  title: string;
  description?: string | null;
  professorId: string;
  tenantId: string;
  offeringId: string | null;
  courseId: string | null;
  maxAttempts: number;
  timeLimit?: number | null;
  passingScore: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  sourceOutlineItemId?: string | null;
  sectionIds: string[];
  questions: Array<{
    type: string;
    question: string;
    options?: unknown;
    correctAnswer?: string | null;
    points: number;
    order: number;
    conceptTags?: string[];
    rubric?: unknown;
    rubricStatus?: string;
  }>;
}): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_create_quiz(${JSON.stringify(payload)}::jsonb) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_create_quiz returned no id');
  return id;
}
