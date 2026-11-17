import { indexText } from '@/lib/knowledge/indexText';
import {
  createCourseMaterialDefiner,
  insertCourseMaterialChunksDefiner,
  setCourseMaterialStatusDefiner,
} from '@/lib/db/knowledgeJobDefiners';

/**
 * Create one Knowledge material + embedded chunks for an entire hosted book
 * (chapters live on book_chapters; this is for RAG only).
 *
 * Uses SECURITY DEFINER helpers — bare inserts omit tenant_id/offering_id and
 * fail FORCE RLS WITH CHECK during book processing / Inngest workers.
 */
export async function indexBookAsMaterial(opts: {
  courseId: string;
  uploadedByUserId: string;
  title: string;
  markdown: string;
}): Promise<string> {
  const material = await createCourseMaterialDefiner({
    courseId: opts.courseId,
    uploadedByUserId: opts.uploadedByUserId,
    title: opts.title.slice(0, 200),
    sourceType: 'UPLOAD',
    mimeType: 'text/markdown',
    byteSize: Buffer.byteLength(opts.markdown, 'utf8'),
    status: 'PROCESSING',
  });

  try {
    // Title-only markdown is ~50 chars; require real chapter body. The AI cap
    // is checked here too (this path used to skip it).
    const { getCourseWorkspaceId } = await import('@/lib/workspace');
    await indexText({
      text: opts.markdown,
      workspaceId: await getCourseWorkspaceId(opts.courseId),
      minChars: 200,
      emptyMessage: 'Book content too short to index',
      write: async (chunks) => {
        await insertCourseMaterialChunksDefiner({
          materialId: material.id,
          courseId: opts.courseId,
          chunks,
        });
      },
    });

    await setCourseMaterialStatusDefiner(material.id, 'READY', null);

    return material.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 500) : 'Indexing failed';
    await setCourseMaterialStatusDefiner(material.id, 'FAILED', message);
    throw err;
  }
}
