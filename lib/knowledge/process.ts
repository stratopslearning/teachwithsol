import { indexText } from '@/lib/knowledge/indexText';
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

    const { getCourseWorkspaceId } = await import('@/lib/workspace');
    await indexText({
      text,
      workspaceId: await getCourseWorkspaceId(material.courseId),
      emptyMessage: 'No usable text extracted from material',
      write: async (chunks) => {
        await deleteCourseMaterialChunksDefiner(materialId);
        await insertCourseMaterialChunksDefiner({
          materialId,
          courseId: material.courseId,
          chunks,
        });
      },
    });

    await setCourseMaterialStatusDefiner(materialId, 'READY', null);
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
