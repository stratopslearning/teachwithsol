/** Soft-delete mirrored knowledge docs when legacy materials are removed. */
export async function softDeleteMirroredKnowledgeDocs(
  materialIds: string[],
): Promise<void> {
  if (materialIds.length === 0) return;
  const { softDeleteMirroredKnowledgeDocsDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  await softDeleteMirroredKnowledgeDocsDefiner(materialIds);
}
