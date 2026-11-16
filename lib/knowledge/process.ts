import { chunkText } from '@/lib/knowledge/chunk';
import { embedTexts } from '@/lib/knowledge/embed';
import {
  extractTextFromUpload,
  extractTextFromUrl,
} from '@/lib/knowledge/extract';
import { getMaterialObjectBytes } from '@/lib/knowledge/storage';
import {
  claimCourseMaterialDefiner,
  deleteCourseMaterialChunksDefiner,
  insertCourseMaterialChunksDefiner,
  listPendingCourseMaterialsDefiner,
  setCourseMaterialStatusDefiner,
} from '@/lib/db/knowledgeJobDefiners';

/**
 * Extract → chunk → embed → READY/FAILED for one material.
 * Claims with DEFINER conditional UPDATE so concurrent callers don't double-process.
 */
export async function processMaterial(materialId: string): Promise<void> {
  const material = await claimCourseMaterialDefiner(materialId);
  if (!material) return;

  try {
    let text = '';
    if (material.sourceType === 'URL' && material.externalUrl) {
      text = await extractTextFromUrl(material.externalUrl);
    } else if (material.sourceType === 'UPLOAD' && material.s3Key) {
      const buf = await getMaterialObjectBytes(material.s3Key);
      text = await extractTextFromUpload({
        buffer: buf,
        mimeType: material.mimeType,
        fileName: material.s3Key.split('/').pop(),
      });
    } else {
      throw new Error('Material has no fetchable source');
    }

    if (!text || text.length < 20) {
      throw new Error('No usable text extracted from material');
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error('Chunking produced no content');
    }

    const { getCourseWorkspaceId, checkAiBandAvailable } = await import(
      '@/lib/workspace'
    );
    const workspaceId = await getCourseWorkspaceId(material.courseId);
    const aiCap = await checkAiBandAvailable(workspaceId);
    if (!aiCap.ok) {
      await setCourseMaterialStatusDefiner(
        materialId,
        'FAILED',
        aiCap.reason.slice(0, 500),
      );
      return;
    }

    // Embed before touching the existing chunks: if the embedding call fails,
    // the material keeps its current search content.
    const embeddings = await embedTexts(chunks.map((c) => c.content));

    await deleteCourseMaterialChunksDefiner(materialId);

    await insertCourseMaterialChunksDefiner({
      materialId,
      courseId: material.courseId,
      chunks: chunks.map((chunk, i) => ({
        chunkIndex: chunk.index,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[i]!,
      })),
    });

    await setCourseMaterialStatusDefiner(materialId, 'READY', null);

    void (async () => {
      try {
        const { getCourseWorkspaceId, recordAiUsage } = await import(
          '@/lib/workspace'
        );
        const workspaceId = await getCourseWorkspaceId(material.courseId);
        if (workspaceId) {
          await recordAiUsage(workspaceId, 'embed', chunks.length);
        }
      } catch (err) {
        console.warn('[processMaterial] usage meter failed', err);
      }
    })();
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 500) : 'Processing failed';
    await setCourseMaterialStatusDefiner(materialId, 'FAILED', message);
  }
}

/** Cron helper: pick stuck PENDING / old PROCESSING rows. */
export async function processPendingMaterials(limit = 10): Promise<number> {
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const pending = await listPendingCourseMaterialsDefiner(limit, staleBefore);

  for (const row of pending) {
    if (row.status === 'PROCESSING') {
      await setCourseMaterialStatusDefiner(row.id, 'PENDING', null);
    }
    await processMaterial(row.id);
  }
  return pending.length;
}
