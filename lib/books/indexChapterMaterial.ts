import { chunkText } from '@/lib/knowledge/chunk';
import { embedTexts } from '@/lib/knowledge/embed';
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
    const text = opts.markdown.trim();
    // Title-only markdown is ~50 chars; require real chapter body.
    if (text.length < 200) {
      throw new Error('Book content too short to index');
    }
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('Chunking produced no content');

    const embeddings = await embedTexts(chunks.map((c) => c.content));
    await insertCourseMaterialChunksDefiner({
      materialId: material.id,
      courseId: opts.courseId,
      chunks: chunks.map((chunk, i) => ({
        chunkIndex: chunk.index,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[i]!,
      })),
    });

    await setCourseMaterialStatusDefiner(material.id, 'READY', null);

    void (async () => {
      try {
        const { getCourseWorkspaceId, recordAiUsage } = await import(
          '@/lib/workspace'
        );
        const workspaceId = await getCourseWorkspaceId(opts.courseId);
        if (workspaceId) {
          await recordAiUsage(workspaceId, 'embed', chunks.length);
        }
      } catch (err) {
        console.warn('[indexBookAsMaterial] usage meter failed', err);
      }
    })();

    return material.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 500) : 'Indexing failed';
    await setCourseMaterialStatusDefiner(material.id, 'FAILED', message);
    throw err;
  }
}

/** @deprecated Use indexBookAsMaterial — kept for any leftover imports. */
export const indexChapterAsMaterial = indexBookAsMaterial;
