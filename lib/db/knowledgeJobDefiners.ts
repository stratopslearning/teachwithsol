/**
 * Knowledge job / connector / clone writes under FORCE RLS (0072).
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

function parseJsonb<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return raw as T;
}

export type ClaimedKnowledgeDocument = {
  id: string;
  workspaceId: string;
  tenantId: string | null;
  currentVersionId: string | null;
  sourceKind: string;
  externalUrl: string | null;
  mimeType: string | null;
  legacyMaterialId: string | null;
  status: string;
};

export async function claimKnowledgeDocumentDefiner(
  documentId: string,
): Promise<ClaimedKnowledgeDocument | null> {
  const result = await db.execute(sql`
    SELECT sol_claim_knowledge_document(${documentId}::uuid) AS row
  `);
  return parseJsonb<ClaimedKnowledgeDocument>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
}

export async function setKnowledgeDocumentStatusDefiner(
  documentId: string,
  status: string,
  error?: string | null,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_set_knowledge_document_status(
      ${documentId}::uuid,
      ${status},
      ${error ?? null}
    )
  `);
}

export async function setCourseMaterialStatusDefiner(
  materialId: string,
  status: string,
  error?: string | null,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_set_course_material_status(
      ${materialId}::uuid,
      ${status},
      ${error ?? null}
    )
  `);
}

export async function supersedeKnowledgeChunksDefiner(
  documentId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_supersede_knowledge_chunks(${documentId}::uuid)
  `);
}

export async function insertKnowledgeChunksDefiner(payload: {
  documentId: string;
  versionId: string;
  workspaceId: string;
  tenantId?: string | null;
  chunks: Array<{
    chunkIndex: number;
    content: string;
    tokenCount: number;
    embedding: number[] | string;
  }>;
}): Promise<number> {
  const normalized = {
    ...payload,
    chunks: payload.chunks.map((c) => ({
      ...c,
      embedding: Array.isArray(c.embedding)
        ? `[${c.embedding.join(',')}]`
        : c.embedding,
    })),
  };
  const result = await db.execute(sql`
    SELECT sol_insert_knowledge_chunks(${JSON.stringify(normalized)}::jsonb) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function updateKnowledgeVersionMetaDefiner(payload: {
  versionId: string;
  ocrUsed?: boolean;
  charCount?: number;
  checksum?: string | null;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_update_knowledge_version_meta(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function resetKnowledgeDocumentPendingDefiner(
  documentId: string,
  currentVersionId?: string | null,
): Promise<void> {
  await db.execute(sql`
    SELECT sol_reset_knowledge_document_pending(
      ${documentId}::uuid,
      ${currentVersionId ?? null}::uuid
    )
  `);
}

export async function cloneCourseKnowledgeLinksDefiner(payload: {
  fromCourseId: string;
  toCourseId: string;
  linkedByUserId?: string | null;
}): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_clone_course_knowledge_links(${JSON.stringify(payload)}::jsonb) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function softDeleteMirroredKnowledgeDocsDefiner(
  materialIds: string[],
): Promise<number> {
  if (materialIds.length === 0) return 0;
  const result = await db.execute(sql`
    SELECT sol_soft_delete_mirrored_knowledge_docs(${asUuidArray(materialIds)}) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function upsertKnowledgeConnectorDefiner(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await db.execute(sql`
    SELECT sol_upsert_knowledge_connector(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_upsert_knowledge_connector returned no row');
  return parsed;
}

export async function updateKnowledgeConnectorDefiner(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await db.execute(sql`
    SELECT sol_update_knowledge_connector(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const parsed = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!parsed?.id) throw new Error('sol_update_knowledge_connector returned no row');
  return parsed;
}

export type CreatedCourseMaterial = {
  id: string;
  courseId: string;
  tenantId: string | null;
  status: string;
};

export async function fetchCourseMaterialByIdDefiner(
  materialId: string,
): Promise<{
  id: string;
  courseId: string;
  tenantId: string | null;
  title: string;
  sourceType: string;
  mimeType: string | null;
  byteSize: number | null;
  s3Key: string | null;
  externalUrl: string | null;
  status: string;
  errorMessage: string | null;
  authoringCorpus: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const result = await db.execute(sql`
    SELECT sol_course_material_by_id(${materialId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) return null;
  const asDate = (v: unknown) =>
    v == null ? null : v instanceof Date ? v : new Date(String(v));
  return {
    id: String(raw.id),
    courseId: String(raw.course_id ?? raw.courseId),
    tenantId: raw.tenant_id
      ? String(raw.tenant_id)
      : raw.tenantId
        ? String(raw.tenantId)
        : null,
    title: String(raw.title ?? ''),
    sourceType: String(raw.source_type ?? raw.sourceType ?? 'UPLOAD'),
    mimeType: raw.mime_type != null ? String(raw.mime_type) : raw.mimeType != null ? String(raw.mimeType) : null,
    byteSize:
      raw.byte_size != null
        ? Number(raw.byte_size)
        : raw.byteSize != null
          ? Number(raw.byteSize)
          : null,
    s3Key: raw.s3_key != null ? String(raw.s3_key) : raw.s3Key != null ? String(raw.s3Key) : null,
    externalUrl:
      raw.external_url != null
        ? String(raw.external_url)
        : raw.externalUrl != null
          ? String(raw.externalUrl)
          : null,
    status: String(raw.status ?? 'PENDING'),
    errorMessage:
      raw.error_message != null
        ? String(raw.error_message)
        : raw.errorMessage != null
          ? String(raw.errorMessage)
          : null,
    authoringCorpus:
      raw.authoring_corpus != null
        ? String(raw.authoring_corpus)
        : raw.authoringCorpus != null
          ? String(raw.authoringCorpus)
          : null,
    deletedAt: asDate(raw.deleted_at ?? raw.deletedAt),
    createdAt: asDate(raw.created_at ?? raw.createdAt) ?? new Date(),
    updatedAt: asDate(raw.updated_at ?? raw.updatedAt) ?? new Date(),
  };
}

export async function fetchBookLinkedMaterialIdsDefiner(
  courseId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT sol_book_linked_material_ids(${courseId}::uuid) AS ids
  `);
  const ids = rowsFromExecute<{ ids: unknown }>(result)[0]?.ids;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id));
}

export async function createCourseMaterialDefiner(payload: {
  courseId: string;
  uploadedByUserId: string;
  title: string;
  sourceType?: 'UPLOAD' | 'URL';
  mimeType?: string | null;
  byteSize?: number | null;
  status?: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
}): Promise<CreatedCourseMaterial> {
  const result = await db.execute(sql`
    SELECT sol_create_course_material(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) throw new Error('sol_create_course_material returned no row');
  return {
    id: String(raw.id),
    courseId: String(raw.course_id ?? raw.courseId ?? payload.courseId),
    tenantId: raw.tenant_id
      ? String(raw.tenant_id)
      : raw.tenantId
        ? String(raw.tenantId)
        : null,
    status: String(raw.status ?? payload.status ?? 'PROCESSING'),
  };
}

export async function insertCourseMaterialChunksDefiner(payload: {
  materialId: string;
  courseId: string;
  chunks: Array<{
    chunkIndex: number;
    content: string;
    tokenCount: number;
    embedding: number[] | string;
  }>;
}): Promise<number> {
  const normalized = {
    ...payload,
    chunks: payload.chunks.map((c) => ({
      ...c,
      embedding: Array.isArray(c.embedding)
        ? `[${c.embedding.join(',')}]`
        : c.embedding,
    })),
  };
  const result = await db.execute(sql`
    SELECT sol_insert_course_material_chunks(${JSON.stringify(normalized)}::jsonb) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function softDeleteCourseMaterialsDefiner(
  materialIds: string[],
): Promise<number> {
  if (materialIds.length === 0) return 0;
  const result = await db.execute(sql`
    SELECT sol_soft_delete_course_materials(${asUuidArray(materialIds)}) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function setCourseMaterialAuthoringCorpusDefiner(
  materialId: string,
  corpus: 'prior_course' | 'this_term',
): Promise<Record<string, unknown> | null> {
  const result = await db.execute(sql`
    SELECT sol_set_course_material_authoring_corpus(
      ${materialId}::uuid,
      ${corpus}
    ) AS row
  `);
  return parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
}

export async function claimCourseMaterialDefiner(
  materialId: string,
): Promise<{
  id: string;
  courseId: string;
  sourceType: string;
  mimeType: string | null;
  s3Key: string | null;
  externalUrl: string | null;
  title: string;
  status: string;
} | null> {
  const result = await db.execute(sql`
    SELECT sol_claim_course_material(${materialId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    courseId: String(raw.course_id ?? raw.courseId),
    sourceType: String(raw.source_type ?? raw.sourceType ?? 'UPLOAD'),
    mimeType:
      raw.mime_type != null
        ? String(raw.mime_type)
        : raw.mimeType != null
          ? String(raw.mimeType)
          : null,
    s3Key:
      raw.s3_key != null
        ? String(raw.s3_key)
        : raw.s3Key != null
          ? String(raw.s3Key)
          : null,
    externalUrl:
      raw.external_url != null
        ? String(raw.external_url)
        : raw.externalUrl != null
          ? String(raw.externalUrl)
          : null,
    title: String(raw.title ?? ''),
    status: String(raw.status ?? 'PROCESSING'),
  };
}

export async function deleteCourseMaterialChunksDefiner(
  materialId: string,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_delete_course_material_chunks(${materialId}::uuid) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function countCourseMaterialChunksDefiner(
  materialId: string,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_course_material_chunk_count(${materialId}::uuid) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function listPendingCourseMaterialsDefiner(
  limit: number,
  staleBefore: Date,
): Promise<Array<{ id: string; status: string; courseId: string }>> {
  const result = await db.execute(sql`
    SELECT sol_list_pending_course_materials(
      ${limit}::integer,
      ${staleBefore.toISOString()}::timestamptz
    ) AS rows
  `);
  const raw = parseJsonb<
    Array<{ id: string; status: string; courseId: string }>
  >(rowsFromExecute<{ rows: unknown }>(result)[0]?.rows);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id: String(r.id),
    status: String(r.status),
    courseId: String(r.courseId),
  }));
}

export async function setBookChaptersMaterialDefiner(
  bookId: string,
  materialId: string | null,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_set_book_chapters_material(
      ${bookId}::uuid,
      ${materialId}::uuid
    ) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export type BookChapterForRag = {
  id: string;
  title: string;
  partTitle: string | null;
  markdown: string;
  materialId: string | null;
  position: number;
};

export async function fetchBookChaptersForRagDefiner(
  bookId: string,
): Promise<BookChapterForRag[]> {
  const result = await db.execute(sql`
    SELECT sol_book_chapters_for_rag(${bookId}::uuid) AS rows
  `);
  const raw = parseJsonb<
    Array<{
      id: string;
      title: string;
      partTitle?: string | null;
      markdown?: string | null;
      materialId?: string | null;
      position?: number | null;
    }>
  >(rowsFromExecute<{ rows: unknown }>(result)[0]?.rows);
  if (!Array.isArray(raw)) return [];
  return raw.map((ch) => ({
    id: String(ch.id),
    title: String(ch.title ?? ''),
    partTitle: ch.partTitle ?? null,
    markdown: String(ch.markdown ?? ''),
    materialId: ch.materialId ? String(ch.materialId) : null,
    position: Number(ch.position ?? 0),
  }));
}

function asDateMaybe(v: unknown): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(String(v));
}

function mapConnectorRow(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    workspaceId: String(raw.workspace_id ?? raw.workspaceId),
    tenantId: raw.tenant_id
      ? String(raw.tenant_id)
      : raw.tenantId
        ? String(raw.tenantId)
        : null,
    provider: String(raw.provider),
    displayName:
      raw.display_name != null
        ? String(raw.display_name)
        : raw.displayName != null
          ? String(raw.displayName)
          : null,
    status: String(raw.status ?? 'draft'),
    lastSyncAt: asDateMaybe(raw.last_sync_at ?? raw.lastSyncAt),
    errorMessage:
      raw.error_message != null
        ? String(raw.error_message)
        : raw.errorMessage != null
          ? String(raw.errorMessage)
          : null,
    config: (raw.config ?? {}) as Record<string, unknown>,
    encryptedTokens:
      raw.encrypted_tokens != null
        ? String(raw.encrypted_tokens)
        : raw.encryptedTokens != null
          ? String(raw.encryptedTokens)
          : null,
    scopes:
      raw.scopes != null
        ? String(raw.scopes)
        : null,
    createdByUserId:
      raw.created_by_user_id != null
        ? String(raw.created_by_user_id)
        : raw.createdByUserId != null
          ? String(raw.createdByUserId)
          : null,
    deletedAt: asDateMaybe(raw.deleted_at ?? raw.deletedAt),
    createdAt: asDateMaybe(raw.created_at ?? raw.createdAt) ?? new Date(),
    updatedAt: asDateMaybe(raw.updated_at ?? raw.updatedAt) ?? new Date(),
  };
}

export type KnowledgeConnectorRow = ReturnType<typeof mapConnectorRow>;

export async function fetchKnowledgeConnectorByIdDefiner(
  connectorId: string,
): Promise<KnowledgeConnectorRow | null> {
  const result = await db.execute(sql`
    SELECT sol_knowledge_connector_by_id(${connectorId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) return null;
  return mapConnectorRow(raw);
}

export async function listKnowledgeConnectorsDefiner(
  workspaceId: string,
): Promise<KnowledgeConnectorRow[]> {
  const result = await db.execute(sql`
    SELECT sol_list_knowledge_connectors(${workspaceId}::uuid) AS rows
  `);
  const raw = parseJsonb<Array<Record<string, unknown>>>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  if (!Array.isArray(raw)) return [];
  return raw.map(mapConnectorRow);
}

export type KnowledgeSyncRunRow = {
  id: string;
  connectorId: string;
  workspaceId: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  createdCount: number | null;
  updatedCount: number | null;
  skippedCount: number | null;
  errorCount: number | null;
  errorMessage: string | null;
};

export async function listKnowledgeSyncRunsDefiner(
  connectorId: string,
  limit = 10,
): Promise<KnowledgeSyncRunRow[]> {
  const result = await db.execute(sql`
    SELECT sol_list_knowledge_sync_runs(
      ${connectorId}::uuid,
      ${limit}::integer
    ) AS rows
  `);
  const raw = parseJsonb<Array<Record<string, unknown>>>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id: String(r.id),
    connectorId: String(r.connector_id ?? r.connectorId),
    workspaceId: String(r.workspace_id ?? r.workspaceId),
    status: String(r.status),
    startedAt: asDateMaybe(r.started_at ?? r.startedAt) ?? new Date(),
    finishedAt: asDateMaybe(r.finished_at ?? r.finishedAt),
    createdCount:
      r.created_count != null
        ? Number(r.created_count)
        : r.createdCount != null
          ? Number(r.createdCount)
          : null,
    updatedCount:
      r.updated_count != null
        ? Number(r.updated_count)
        : r.updatedCount != null
          ? Number(r.updatedCount)
          : null,
    skippedCount:
      r.skipped_count != null
        ? Number(r.skipped_count)
        : r.skippedCount != null
          ? Number(r.skippedCount)
          : null,
    errorCount:
      r.error_count != null
        ? Number(r.error_count)
        : r.errorCount != null
          ? Number(r.errorCount)
          : null,
    errorMessage:
      r.error_message != null
        ? String(r.error_message)
        : r.errorMessage != null
          ? String(r.errorMessage)
          : null,
  }));
}

export async function fetchKnowledgeDocByConnectorExternalDefiner(
  workspaceId: string,
  connectorId: string,
  externalId: string,
): Promise<{
  id: string;
  workspaceId: string;
  currentVersionId: string | null;
  status: string;
  title: string;
} | null> {
  const result = await db.execute(sql`
    SELECT sol_knowledge_doc_by_connector_external(
      ${workspaceId}::uuid,
      ${connectorId}::uuid,
      ${externalId}
    ) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    workspaceId: String(raw.workspace_id ?? raw.workspaceId),
    currentVersionId: raw.current_version_id
      ? String(raw.current_version_id)
      : raw.currentVersionId
        ? String(raw.currentVersionId)
        : null,
    status: String(raw.status ?? 'PENDING'),
    title: String(raw.title ?? ''),
  };
}

export async function createConnectorKnowledgeDocumentDefiner(payload: {
  id?: string;
  workspaceId: string;
  title: string;
  sourceKind?: string;
  mimeType?: string | null;
  byteSize?: number | null;
  connectorId: string;
  externalId: string;
  externalPath?: string | null;
  status?: string;
  visibility?: string;
  createdByUserId?: string | null;
}): Promise<{ id: string }> {
  const result = await db.execute(sql`
    SELECT sol_create_connector_knowledge_document(
      ${JSON.stringify(payload)}::jsonb
    ) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) {
    throw new Error('sol_create_connector_knowledge_document returned no row');
  }
  return { id: String(raw.id) };
}

export async function startKnowledgeSyncRunDefiner(payload: {
  connectorId: string;
}): Promise<{ id: string }> {
  const result = await db.execute(sql`
    SELECT sol_start_knowledge_sync_run(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) throw new Error('sol_start_knowledge_sync_run returned no row');
  return { id: String(raw.id) };
}

export async function finishKnowledgeSyncRunDefiner(payload: {
  runId: string;
  connectorId: string;
  status: 'succeeded' | 'failed';
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  errorMessage?: string | null;
  config?: Record<string, unknown>;
}): Promise<void> {
  await db.execute(sql`
    SELECT sol_finish_knowledge_sync_run(${JSON.stringify(payload)}::jsonb)
  `);
}

export async function fetchKnowledgeVersionByIdDefiner(versionId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_knowledge_version_by_id(${versionId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    document_id: string;
    checksum: string | null;
    version: number;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    documentId: r.document_id,
    checksum: r.checksum,
    version: Number(r.version),
  };
}

export async function adminPurgeCourseMaterialDefiner(materialId: string): Promise<{
  s3Key: string | null;
  courseId: string;
  title: string;
  tenantId: string | null;
}> {
  const result = await db.execute(sql`
    SELECT sol_admin_purge_course_material(${materialId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) throw new Error('Material not found');
  return {
    s3Key: raw.s3Key != null ? String(raw.s3Key) : null,
    courseId: String(raw.courseId),
    title: String(raw.title ?? ''),
    tenantId: raw.tenantId != null ? String(raw.tenantId) : null,
  };
}
