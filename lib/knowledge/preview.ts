import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { courseMaterials, knowledgeChunks } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { fetchKnowledgeDocumentById } from '@/lib/db/entityScopedReads';
import { withTenant } from '@/lib/db/tenantContext';
import type { AuthUser } from '@/lib/getOrCreateUser';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import {
  assertWorkspaceFacultyRead,
  isWorkspaceKnowledgeCoordinator,
} from '@/lib/knowledge/workspaceAccess';
import { getMaterialObjectBytes } from '@/lib/knowledge/storage';

export type KnowledgePreviewMeta = {
  id: string;
  title: string;
  sourceKind: string;
  mimeType: string | null;
  externalUrl: string | null;
  hasFile: boolean;
  status: string;
};

type PreviewDoc = {
  id: string;
  workspaceId: string;
  title: string;
  visibility: 'personal' | 'workspace';
  createdByUserId: string | null;
  currentVersionId: string | null;
  status: string;
};

type PreviewVersion = {
  id: string;
  s3Key: string | null;
  mimeType: string | null;
  byteSize: number | null;
};

function rowsFromExecute<T>(result: unknown): T[] {
  return (
    (result as { rows?: T[] }).rows ??
    (Array.isArray(result) ? (result as T[]) : [])
  );
}

/** Version row via SECURITY DEFINER (BYPASSRLS owner) — includes s3_key. */
async function fetchVersionById(
  versionId: string,
): Promise<PreviewVersion | null> {
  const result = await db.execute(sql`
    SELECT id, s3_key, mime_type, byte_size
    FROM sol_knowledge_version_by_id(${versionId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    s3_key: string | null;
    mime_type: string | null;
    byte_size: number | null;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    s3Key: r.s3_key,
    mimeType: r.mime_type,
    byteSize: r.byte_size,
  };
}

/**
 * Resolve document under FORCE RLS.
 * Bare drizzle reads return 0 rows without app.tenant_id — that surfaced as
 * a false "Document not found" even when the library list (DEFINER) showed it.
 */
async function assertCanPreviewDocument(
  user: AuthUser,
  documentId: string,
): Promise<PreviewDoc> {
  const doc = await fetchKnowledgeDocumentById(documentId);
  if (!doc || doc.deletedAt) throw ApiError.notFound('Document not found');
  await assertWorkspaceFacultyRead(user, doc.workspaceId);
  if (doc.visibility === 'personal') {
    const coordinator = await isWorkspaceKnowledgeCoordinator(
      user,
      doc.workspaceId,
    );
    if (!coordinator && doc.createdByUserId !== user.id && !user.platformStaff) {
      throw ApiError.forbidden('You cannot preview this document');
    }
  }
  return doc;
}

async function resolveVersionId(
  doc: PreviewDoc,
  userId: string,
  courseId?: string | null,
): Promise<string | null> {
  if (courseId) {
    // Link row is tenant-scoped; pin GUC for this short read.
    const pinned = await withTenant(doc.workspaceId, userId, async (tx) => {
      const result = await tx.execute(sql`
        SELECT pinned_version_id
        FROM course_knowledge_links
        WHERE course_id = ${courseId}::uuid
          AND document_id = ${doc.id}::uuid
        LIMIT 1
      `);
      const row = rowsFromExecute<{ pinned_version_id: string | null }>(
        result,
      )[0];
      return row?.pinned_version_id ?? null;
    });
    if (pinned) return pinned;
  }
  return doc.currentVersionId;
}

/** Rebuild preview text from indexed chunks when the original file is gone. */
async function bytesFromChunks(
  workspaceId: string,
  userId: string,
  versionId: string,
): Promise<Buffer | null> {
  return withTenant(workspaceId, userId, async (tx) => {
    const chunks = await tx
      .select({ content: knowledgeChunks.content })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.versionId, versionId),
          isNull(knowledgeChunks.deletedAt),
          isNull(knowledgeChunks.supersededAt),
        ),
      )
      .orderBy(asc(knowledgeChunks.chunkIndex));
    if (chunks.length === 0) return null;
    return Buffer.from(chunks.map((c) => c.content).join('\n\n'), 'utf8');
  });
}

export async function getKnowledgePreviewMeta(
  user: AuthUser,
  documentId: string,
  courseId?: string | null,
): Promise<KnowledgePreviewMeta> {
  const doc = await assertCanPreviewDocument(user, documentId);
  if (courseId) await assertCanManageCourse(user, courseId);
  const versionId = await resolveVersionId(doc, user.id, courseId);
  let hasFile = false;
  let mimeType: string | null = null;
  if (versionId) {
    const version = await fetchVersionById(versionId);
    mimeType = version?.mimeType ?? null;
    hasFile = Boolean(version?.s3Key);
    if (!hasFile && version) {
      const chunkBytes = await bytesFromChunks(
        doc.workspaceId,
        user.id,
        version.id,
      );
      hasFile = Boolean(chunkBytes?.byteLength);
    }
  }
  return {
    id: doc.id,
    title: doc.title,
    sourceKind: 'UPLOAD',
    mimeType,
    externalUrl: null,
    hasFile,
    status: doc.status,
  };
}

export async function getKnowledgePreviewBytes(
  user: AuthUser,
  documentId: string,
  courseId?: string | null,
): Promise<{
  bytes: Buffer;
  mimeType: string;
  title: string;
}> {
  const doc = await assertCanPreviewDocument(user, documentId);
  if (courseId) await assertCanManageCourse(user, courseId);
  const versionId = await resolveVersionId(doc, user.id, courseId);
  if (!versionId) throw ApiError.notFound('No file version available');
  const version = await fetchVersionById(versionId);
  if (!version) throw ApiError.notFound('No file version available');

  const mimeType = version.mimeType || 'application/octet-stream';
  const textLike =
    mimeType.startsWith('text/') ||
    mimeType.includes('markdown') ||
    mimeType === 'application/json';

  if (version.s3Key) {
    try {
      const bytes = await getMaterialObjectBytes(version.s3Key);
      return { bytes, mimeType, title: doc.title };
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const isMissing =
        message.includes('NoSuchKey') ||
        message.includes('NotFound') ||
        message.includes('The specified key does not exist');
      if (!isMissing || !textLike) {
        console.error('[knowledge preview] S3 read failed', {
          documentId,
          key: version.s3Key,
          message,
        });
        throw isMissing
          ? ApiError.notFound('Stored file is missing from storage')
          : ApiError.internal('Could not read stored file');
      }
    }
  }

  if (textLike) {
    const fromChunks = await bytesFromChunks(
      doc.workspaceId,
      user.id,
      version.id,
    );
    if (fromChunks?.byteLength) {
      return { bytes: fromChunks, mimeType, title: doc.title };
    }
  }

  throw ApiError.notFound(
    version.s3Key
      ? 'Stored file is missing from storage'
      : 'No file content available for preview',
  );
}

/** Legacy course_materials row (unmirrored uploads). */
export async function getLegacyMaterialPreviewBytes(
  user: AuthUser,
  materialId: string,
): Promise<{
  bytes: Buffer;
  mimeType: string;
  title: string;
  externalUrl: string | null;
}> {
  const { fetchCourseMaterialByIdDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  const material = await fetchCourseMaterialByIdDefiner(materialId);
  if (!material || material.deletedAt) {
    throw ApiError.notFound('Material not found');
  }
  await assertCanManageCourse(user, material.courseId);
  if (material.externalUrl && !material.s3Key) {
    return {
      bytes: Buffer.alloc(0),
      mimeType: material.mimeType || 'text/plain',
      title: material.title,
      externalUrl: material.externalUrl,
    };
  }
  if (!material.s3Key) throw ApiError.notFound('File not stored');
  const bytes = await getMaterialObjectBytes(material.s3Key);
  return {
    bytes,
    mimeType: material.mimeType || 'application/octet-stream',
    title: material.title,
    externalUrl: material.externalUrl,
  };
}
