/**
 * The one indexing path for search content (materials, knowledge documents,
 * book text): chunk → check the workspace AI cap → embed → write → meter.
 *
 * Embedding happens before `write`, so a failed embedding call leaves the
 * current search content in place. Usage is metered after the write and
 * awaited (it used to be fire-and-forget, so failures were invisible).
 */
import { chunkText } from '@/lib/knowledge/chunk';
import { embedTexts } from '@/lib/knowledge/embed';

export type IndexedChunk = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[];
};

export async function indexText(opts: {
  text: string;
  /** Workspace to check the AI cap for and meter against (null = skip both). */
  workspaceId: string | null;
  /** Below this many characters the text is rejected. */
  minChars?: number;
  emptyMessage?: string;
  /** Replace the target's chunks with these rows. */
  write: (chunks: IndexedChunk[]) => Promise<void>;
}): Promise<{ chunkCount: number }> {
  const text = opts.text.trim();
  if (text.length < (opts.minChars ?? 20)) {
    throw new Error(opts.emptyMessage ?? 'No usable text to index');
  }
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error('Chunking produced no content');

  if (opts.workspaceId) {
    const { checkAiBandAvailable } = await import('@/lib/workspace');
    const aiCap = await checkAiBandAvailable(opts.workspaceId);
    if (!aiCap.ok) throw new Error(aiCap.reason);
  }

  const embeddings = await embedTexts(chunks.map((c) => c.content));
  await opts.write(
    chunks.map((chunk, i) => ({
      chunkIndex: chunk.index,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: embeddings[i]!,
    })),
  );

  if (opts.workspaceId) {
    try {
      const { recordAiUsage } = await import('@/lib/workspace');
      await recordAiUsage(opts.workspaceId, 'embed', chunks.length);
    } catch (err) {
      // Metering must not fail an index that already succeeded.
      console.warn('[indexText] usage meter failed', err);
    }
  }
  return { chunkCount: chunks.length };
}
