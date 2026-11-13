import { hostedBooks } from '@/app/db/schema';
import { indexBookChaptersAsSingleMaterial } from '@/lib/books/bookKnowledge';
import { crawlWebbook } from '@/lib/books/crawlWebbook';
import { flattenParsedChapters } from '@/lib/books/hierarchy';
import { parseEpub } from '@/lib/books/parseEpub';
import { parsePdf } from '@/lib/books/parsePdf';
import { parsePressbooksXml } from '@/lib/books/parsePressbooksXml';
import { clearYoutubeTitleCache } from '@/lib/books/resolveYoutubeByTitle';
import type { ParsedBook } from '@/lib/books/types';
import {
  insertBookChapterDefiner,
  softDeleteBookChaptersDefiner,
  updateHostedBookDefiner,
} from '@/lib/db/bookWriteDefiners';
import { getMaterialObjectBytes } from '@/lib/knowledge/storage';

async function persistParsedBook(
  book: typeof hostedBooks.$inferSelect,
  parsed: ParsedBook,
): Promise<void> {
  // Collect prior RAG material ids BEFORE soft-deleting chapters, otherwise
  // reprocess leaves orphan Ready uploads that show up as Focus "Upload" dupes.
  const { fetchBookChaptersForRagDefiner } = await import(
    '@/lib/db/knowledgeJobDefiners'
  );
  const priorMaterialIds = [
    ...new Set(
      (await fetchBookChaptersForRagDefiner(book.id))
        .map((c) => c.materialId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  await softDeleteBookChaptersDefiner(book.id);

  const bookTitle = (parsed.title || book.title).slice(0, 300);
  if (parsed.title && parsed.title !== book.title) {
    await updateHostedBookDefiner({ bookId: book.id, title: bookTitle });
  }

  const flat = flattenParsedChapters(parsed.chapters);

  // One Knowledge material for the whole book (RAG); chapters are reader TOC.
  // Best-effort: material inserts may still hit RLS; book import should not fail.
  const materialId = await indexBookChaptersAsSingleMaterial({
    bookId: book.id,
    courseId: book.courseId,
    uploadedByUserId: book.createdByUserId,
    bookTitle,
    chapters: flat,
    priorMaterialIds,
  });

  const insertedIds: string[] = [];
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]!;
    const parentId =
      ch.parentPosition != null ? (insertedIds[ch.parentPosition] ?? null) : null;
    const id = await insertBookChapterDefiner({
      bookId: book.id,
      courseId: book.courseId,
      parentId,
      level: ch.level,
      position: i,
      title: ch.title.slice(0, 300),
      slug: ch.slug.slice(0, 120),
      partTitle: ch.partTitle?.slice(0, 300) ?? null,
      markdown: ch.markdown || `# ${ch.title.slice(0, 300)}\n`,
      html: ch.html?.trim() ? ch.html : null,
      sourceUrl: ch.sourceUrl ?? null,
      materialId,
    });
    insertedIds.push(id);
  }

  await updateHostedBookDefiner({
    bookId: book.id,
    status: 'READY',
    errorMessage: null,
  });
}

/**
 * Process a PENDING hosted book: parse source → chapters → Knowledge index.
 */
export async function processBook(bookId: string): Promise<void> {
  const book = await updateHostedBookDefiner({
    bookId,
    status: 'PROCESSING',
    errorMessage: null,
    onlyIfStatus: 'PENDING',
  });
  if (!book) return;
  clearYoutubeTitleCache();

  try {
    let parsed: ParsedBook;
    if (book.sourceKind === 'WEBBOOK_URL') {
      if (!book.sourceUrl) throw new Error('Book has no source URL');
      parsed = await crawlWebbook(book.sourceUrl);
    } else if (book.sourceKind === 'EPUB') {
      if (!book.s3Key) throw new Error('EPUB book has no stored file');
      const buf = await getMaterialObjectBytes(book.s3Key);
      parsed = await parseEpub(buf);
    } else if (book.sourceKind === 'PRESSBOOKS_XML') {
      if (!book.s3Key) throw new Error('XML book has no stored file');
      const buf = await getMaterialObjectBytes(book.s3Key);
      parsed = await parsePressbooksXml(buf.toString('utf8'));
    } else if (book.sourceKind === 'PDF') {
      if (!book.s3Key) throw new Error('PDF book has no stored file');
      const buf = await getMaterialObjectBytes(book.s3Key);
      parsed = await parsePdf(buf, { title: book.title, fileName: 'book.pdf' });
    } else {
      throw new Error(`Unknown source kind: ${book.sourceKind}`);
    }

    await persistParsedBook(book, parsed);
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 500) : 'Book processing failed';
    await updateHostedBookDefiner({
      bookId: book.id,
      status: 'FAILED',
      errorMessage: message,
    });
  }
}

/** Process upload buffer inline (local/dev without waiting on S3 re-fetch). */
export async function processBookFromBuffer(
  bookId: string,
  buffer: Buffer,
  kind: 'EPUB' | 'PRESSBOOKS_XML' | 'PDF',
): Promise<void> {
  const book = await updateHostedBookDefiner({
    bookId,
    status: 'PROCESSING',
    errorMessage: null,
    onlyIfStatus: 'PENDING',
  });
  if (!book) return;
  clearYoutubeTitleCache();

  try {
    const parsed =
      kind === 'EPUB'
        ? await parseEpub(buffer)
        : kind === 'PDF'
          ? await parsePdf(buffer, { title: book.title, fileName: 'book.pdf' })
          : await parsePressbooksXml(buffer.toString('utf8'));
    await persistParsedBook(book, parsed);
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 500) : 'Book processing failed';
    await updateHostedBookDefiner({
      bookId: book.id,
      status: 'FAILED',
      errorMessage: message,
    });
  }
}

/**
 * Cron helper: drain stuck PENDING books and stale PROCESSING rows.
 * Mirrors processPendingMaterials — Inngest may miss events after deploy.
 */
export async function processPendingBooks(limit = 3): Promise<number> {
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const { listPendingHostedBooksDefiner } = await import(
    '@/lib/db/bookWriteDefiners'
  );
  const pending = await listPendingHostedBooksDefiner(limit, staleBefore);

  for (const row of pending) {
    if (row.status === 'PROCESSING') {
      await updateHostedBookDefiner({
        bookId: row.id,
        status: 'PENDING',
        errorMessage: null,
      });
    }
    await processBook(row.id);
  }
  return pending.length;
}
