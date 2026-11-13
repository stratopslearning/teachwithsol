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
