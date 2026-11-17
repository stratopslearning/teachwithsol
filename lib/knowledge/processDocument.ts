import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  claimKnowledgeDocumentDefiner,
  insertKnowledgeChunksDefiner,
  listPendingKnowledgeDocumentsDefiner,
  resetKnowledgeDocumentPendingDefiner,
  setCourseMaterialStatusDefiner,
  setKnowledgeDocumentStatusDefiner,
  supersedeKnowledgeChunksDefiner,
  updateKnowledgeVersionMetaDefiner,
} from '@/lib/db/knowledgeJobDefiners';
import { rowsFromExecute } from '@/lib/db/rows';
import { indexText } from '@/lib/knowledge/indexText';
import {
  extractTextFromUpload,
  extractTextFromUrl,
} from '@/lib/knowledge/extract';
import { ocrBufferWithTextract, shouldTryOcr } from '@/lib/knowledge/ocr';
import { getMaterialObjectBytes } from '@/lib/knowledge/storage';

async function fetchVersionById(versionId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_knowledge_version_by_id(${versionId}::uuid)
  `);
  const r = rowsFromExecute<{
    id: string;
    document_id: string;
    s3_key: string | null;
    checksum: string | null;
    mime_type: string | null;
    byte_size: number | null;
    version: number;
    ocr_used: boolean;
    char_count: number | null;
  }>(result)[0];
  if (!r) return null;
  return {
    id: r.id,
    documentId: r.document_id,
    s3Key: r.s3_key,
    checksum: r.checksum,
    mimeType: r.mime_type,
    byteSize: r.byte_size,
    version: r.version,
    ocrUsed: r.ocr_used,
    charCount: r.char_count,
  };
}

/**
 * Extract → (OCR if needed) → chunk → embed for the document's current version.
 * FORCE RLS: all document/chunk writes go through SECURITY DEFINER helpers.
 */
export async function processKnowledgeDocument(
  documentId: string,
): Promise<void> {
  const doc = await claimKnowledgeDocumentDefiner(documentId);
  if (!doc) return;

  try {
    if (!doc.currentVersionId) {
      throw new Error('Document has no current version');
    }
    const version = await fetchVersionById(doc.currentVersionId);
    if (!version) throw new Error('Current version not found');

    let text = '';
    let ocrUsed = false;
    let buffer: Buffer | null = null;

    if (doc.sourceKind === 'URL' && doc.externalUrl) {
      text = await extractTextFromUrl(doc.externalUrl);
    } else if (version.s3Key) {
      buffer = await getMaterialObjectBytes(version.s3Key);
      text = await extractTextFromUpload({
        buffer,
        mimeType: version.mimeType ?? doc.mimeType,
        fileName: version.s3Key.split('/').pop(),
      });
    } else if (doc.externalUrl) {
      text = await extractTextFromUrl(doc.externalUrl);
    } else {
      throw new Error('Document has no fetchable source');
    }

    if (
      buffer &&
      shouldTryOcr({
        text,
        mimeType: version.mimeType ?? doc.mimeType,
        fileName: version.s3Key?.split('/').pop(),
      })
    ) {
      try {
        const ocrText = await ocrBufferWithTextract(buffer);
        if (ocrText.length > text.length) {
          text = ocrText;
          ocrUsed = true;
        }
      } catch (err) {
        console.warn('[processKnowledgeDocument] OCR skipped', err);
      }
    }

    await indexText({
      text,
      workspaceId: doc.workspaceId,
      emptyMessage: 'No usable text extracted from document',
      write: async (chunks) => {
        await supersedeKnowledgeChunksDefiner(documentId);
        await insertKnowledgeChunksDefiner({
          documentId,
          versionId: version.id,
          workspaceId: doc.workspaceId,
          tenantId: doc.tenantId ?? doc.workspaceId,
          chunks,
        });
      },
    });

    await updateKnowledgeVersionMetaDefiner({
      versionId: version.id,
      ocrUsed,
      charCount: text.length,
      checksum:
        version.checksum ??
        createHash('sha256').update(text).digest('hex').slice(0, 64),
    });

    await setKnowledgeDocumentStatusDefiner(documentId, 'READY', null);

    if (doc.legacyMaterialId) {
      await setCourseMaterialStatusDefiner(doc.legacyMaterialId, 'READY', null);
    }

  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 500) : 'Processing failed';
    await setKnowledgeDocumentStatusDefiner(documentId, 'FAILED', message);
    if (doc.legacyMaterialId) {
      await setCourseMaterialStatusDefiner(
        doc.legacyMaterialId,
        'FAILED',
        message,
      );
    }
  }
}

/** Force reprocess of current version (reset to PENDING). */
export async function reprocessKnowledgeDocument(
  documentId: string,
): Promise<void> {
  await resetKnowledgeDocumentPendingDefiner(documentId);
  await processKnowledgeDocument(documentId);
}

/** Point currentVersionId at an older version and re-index. */
export async function restoreKnowledgeDocumentVersion(
  documentId: string,
  versionId: string,
): Promise<void> {
  const version = await fetchVersionById(versionId);
  if (!version || version.documentId !== documentId) {
    throw new Error('Version not found');
  }

  await resetKnowledgeDocumentPendingDefiner(documentId, versionId);

  const { notifyLinkedCoursesOfNewVersion } = await import(
    '@/lib/knowledge/linkVersions'
  );
  await notifyLinkedCoursesOfNewVersion(documentId, versionId);
  await processKnowledgeDocument(documentId);
}

export async function nextDocumentVersionNumber(
  documentId: string,
): Promise<number> {
  const { fetchKnowledgeDocumentVersions } = await import(
    '@/lib/db/entityScopedReads'
  );
  const versions = await fetchKnowledgeDocumentVersions(documentId);
  const max = versions.reduce((m, v) => Math.max(m, v.version), 0);
  return max + 1;
}

/**
 * Cron sweep: queue a job for each PENDING document, and for PROCESSING ones
 * stuck longer than 15 minutes (a crashed worker never clears its claim; the
 * job resets them first).
 */
export async function processPendingKnowledgeDocuments(limit = 10): Promise<number> {
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const pending = await listPendingKnowledgeDocumentsDefiner(limit, staleBefore);
  const { enqueueKnowledgeDocumentProcess } = await import('@/lib/jobs/enqueue');
  for (const row of pending) {
    await enqueueKnowledgeDocumentProcess(row.id, 'default', {
      reset: row.status === 'PROCESSING',
    });
  }
  return pending.length;
}
