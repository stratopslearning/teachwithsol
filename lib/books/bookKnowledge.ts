import { indexBookAsMaterial } from '@/lib/books/indexChapterMaterial';
import type { ParsedChapter } from '@/lib/books/types';
import { fetchHostedBookByIdDefiner } from '@/lib/db/bookWriteDefiners';import {
  fetchBookChaptersForRagDefiner,
  setBookChaptersMaterialDefiner,
  softDeleteCourseMaterialsDefiner,
} from '@/lib/db/knowledgeJobDefiners';

/** Soft-delete Knowledge materials + chunks (book-linked RAG rows). */
export async function softDeleteLinkedMaterials(
  materialIds: string[],
): Promise<void> {
  const ids = [...new Set(materialIds.filter(Boolean))];
  if (ids.length === 0) return;
  await softDeleteCourseMaterialsDefiner(ids);
}

/** Build one RAG markdown body from ordered chapters. */
export function buildBookIndexMarkdown(
  bookTitle: string,
  chapters: Array<Pick<ParsedChapter, 'title' | 'partTitle' | 'markdown'>>,
): string {
  const parts: string[] = [`# ${bookTitle.trim() || 'Untitled book'}`];
  let lastPart: string | null = null;
  for (const ch of chapters) {
    const part = ch.partTitle?.trim() || null;
    if (part && part !== lastPart) {
      parts.push(`\n## ${part}`);
      lastPart = part;
    }
    parts.push(`\n### ${ch.title.trim() || 'Chapter'}\n`);
    parts.push(ch.markdown.trim());
  }
  return parts.join('\n').trim();
}

/**
 * Soft-delete prior Knowledge materials for a book, index one new material
 * from chapter markdown, and point all active chapters at it.
 */
export async function indexBookChaptersAsSingleMaterial(opts: {
  bookId: string;
  courseId: string;
  uploadedByUserId: string;
  bookTitle: string;
  chapters: Array<{
    id?: string;
    title: string;
    partTitle?: string | null;
    markdown: string;
  }>;
  /** Existing material ids to retire before creating the new one. */
  priorMaterialIds?: string[];
}): Promise<string | null> {
  const prior =
    opts.priorMaterialIds ??
    (
      await fetchBookChaptersForRagDefiner(opts.bookId)
    )
      .map((r) => r.materialId)
      .filter((id): id is string => id != null);

  await softDeleteLinkedMaterials(prior);

  const markdown = buildBookIndexMarkdown(
    opts.bookTitle,
    opts.chapters.map((c) => ({
      title: c.title,
      partTitle: c.partTitle ?? null,
      markdown: c.markdown,
    })),
  );

  if (markdown.length < 200) return null;

  try {
    const materialId = await indexBookAsMaterial({
      courseId: opts.courseId,
      uploadedByUserId: opts.uploadedByUserId,
      title: opts.bookTitle.slice(0, 200),
      markdown,
    });
    await setBookChaptersMaterialDefiner(opts.bookId, materialId);
    return materialId;
  } catch (err) {
    console.warn('[indexBookChaptersAsSingleMaterial] failed', {
      bookId: opts.bookId,
      err,
    });
    return null;
  }
}

/**
 * Idempotent: if a READY book still has multiple distinct materialIds across
 * chapters, collapse to one Knowledge material built from chapter markdown.
 */
export async function consolidateBookKnowledge(
  bookId: string,
): Promise<{ consolidated: boolean }> {
  const book = await fetchHostedBookByIdDefiner(bookId);
  if (!book || book.status !== 'READY') {
    return { consolidated: false };
  }

  const chapters = await fetchBookChaptersForRagDefiner(bookId);
  if (chapters.length === 0) return { consolidated: false };

  const distinct = new Set(
    chapters
      .map((c) => c.materialId)
      .filter((id): id is string => id != null),
  );
  if (distinct.size <= 1) return { consolidated: false };

  await indexBookChaptersAsSingleMaterial({
    bookId: book.id,
    courseId: book.courseId,
    uploadedByUserId: book.createdByUserId,
    bookTitle: book.title,
    chapters,
    priorMaterialIds: [...distinct],
  });

  return { consolidated: true };
}

/**
 * Index (or re-index) Knowledge RAG for a READY book that has chapters but no
 * usable linked material — e.g. after a prior RLS failure during import.
 */
export async function ensureBookKnowledgeIndexed(
  bookId: string,
  opts?: { force?: boolean },
): Promise<{ materialId: string | null; indexed: boolean }> {
  const book = await fetchHostedBookByIdDefiner(bookId);
  if (!book || book.status !== 'READY') {
    return { materialId: null, indexed: false };
  }

  const chapters = await fetchBookChaptersForRagDefiner(bookId);
  if (chapters.length === 0) return { materialId: null, indexed: false };

  const linked = chapters
    .map((c) => c.materialId)
    .filter((id): id is string => id != null);
  const distinct = [...new Set(linked)];
  if (!opts?.force && distinct.length === 1) {
    const candidateId = distinct[0]!;
    const { fetchCourseMaterialByIdDefiner, countCourseMaterialChunksDefiner } =
      await import('@/lib/db/knowledgeJobDefiners');
    const material = await fetchCourseMaterialByIdDefiner(candidateId);
    if (material && !material.deletedAt && material.status === 'READY') {
      const chunkCount = await countCourseMaterialChunksDefiner(candidateId);
      if (chunkCount > 0) {
        return { materialId: candidateId, indexed: false };
      }
    }
    // Linked row missing / not READY / no chunks — fall through and re-index.
  }

  const materialId = await indexBookChaptersAsSingleMaterial({
    bookId: book.id,
    courseId: book.courseId,
    uploadedByUserId: book.createdByUserId,
    bookTitle: book.title,
    chapters,
    priorMaterialIds: distinct,
  });

  return { materialId, indexed: materialId != null };
}

/**
 * Soft-delete Knowledge materials that only hang off soft-deleted book
 * chapters (no active chapter still points at them), plus title-matched
 * uploads left behind when a reprocess dropped chapter→material links.
 */
async function cleanupOrphanBookMaterials(courseId: string): Promise<number> {
  const {
    fetchBookChapterMaterialLinksForCourseDefiner,
    fetchHostedBooksForCourseDefiner,
  } = await import('@/lib/db/bookWriteDefiners');
  const { fetchCourseMaterialsList } = await import(
    '@/lib/db/entityScopedReads'
  );

  const allLinked =
    await fetchBookChapterMaterialLinksForCourseDefiner(courseId);

  const active = new Set<string>();
  const seen = new Set<string>();
  for (const row of allLinked) {
    if (!row.materialId) continue;
    seen.add(row.materialId);
    if (row.deletedAt == null) active.add(row.materialId);
  }
  const orphans = new Set([...seen].filter((id) => !active.has(id)));

  // Reprocess used to soft-delete chapters before collecting prior material
  // ids, so orphans can have zero chapter links. Retire any Ready material
  // that shares a hosted book title but is not the active book corpus.
  const books = (await fetchHostedBooksForCourseDefiner(courseId)).filter(
    (b) => b.status === 'READY' && !b.deletedAt,
  );
  const bookTitles = new Set(
    books.map((b) => b.title.trim().toLowerCase()).filter(Boolean),
  );
  if (bookTitles.size > 0) {
    const materials = await fetchCourseMaterialsList(courseId);
    for (const m of materials) {
      if (!bookTitles.has(String(m.title ?? '').trim().toLowerCase())) continue;
      if (active.has(m.id)) continue;
      orphans.add(m.id);
    }
  }

  const orphanIds = [...orphans];
  await softDeleteLinkedMaterials(orphanIds);
  return orphanIds.length;
}

/** Consolidate every READY book in a course that still has fragmented materials. */
export async function consolidateCourseBookKnowledge(
  courseId: string,
): Promise<{ consolidated: number; orphansRemoved: number }> {
  const { fetchHostedBooksForCourseDefiner } = await import(
    '@/lib/db/bookWriteDefiners'
  );
  const books = (await fetchHostedBooksForCourseDefiner(courseId)).filter(
    (b) => b.status === 'READY' && !b.deletedAt,
  );

  let consolidated = 0;
  for (const b of books) {
    try {
      const result = await consolidateBookKnowledge(b.id);
      if (result.consolidated) consolidated += 1;
    } catch (err) {
      console.warn('[consolidateCourseBookKnowledge] book failed', {
        bookId: b.id,
        err,
      });
    }
  }

  let orphansRemoved = 0;
  try {
    orphansRemoved = await cleanupOrphanBookMaterials(courseId);
  } catch (err) {
    console.warn('[consolidateCourseBookKnowledge] orphan cleanup failed', err);
  }

  return { consolidated, orphansRemoved };
}
