import { ApiError } from '@/lib/api/errors';
import { assertCanManageBook } from '@/lib/books/access';
import { isMetaTocChapter } from '@/lib/books/hierarchy';
import {
  fetchBookChapterForReaderDefiner,
  fetchBookChaptersTocForBookDefiner,
} from '@/lib/db/bookWriteDefiners';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';

/** Faculty preview: same TOC shape as student, gated by course manage access. */
export async function getFacultyBookToc(user: AuthUser, bookId: string) {
  const book = await assertCanManageBook(user, bookId);
  const chapters = await fetchBookChaptersTocForBookDefiner(bookId);
  return {
    id: book.id,
    title: book.title,
    courseId: book.courseId,
    chapters,
  };
}

export async function getFacultyChapter(
  user: AuthUser,
  chapterId: string,
) {
  const chapter = await fetchBookChapterForReaderDefiner(chapterId);
  if (!chapter) throw ApiError.notFound('Chapter not found');
  const book = await assertCanManageBook(user, chapter.bookId);

  const siblings = await fetchBookChaptersTocForBookDefiner(book.id);
  const idx = siblings.findIndex((s) => s.id === chapter.id);
  const isMeta = (s: { title: string }) => isMetaTocChapter(s, book.title);
  let prev: (typeof siblings)[number] | null = null;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const cand = siblings[i]!;
    if (!isMeta(cand)) {
      prev = cand;
      break;
    }
  }
  let next: (typeof siblings)[number] | null = null;
  for (let i = idx + 1; i < siblings.length; i += 1) {
    const cand = siblings[i]!;
    if (!isMeta(cand)) {
      next = cand;
      break;
    }
  }

  return {
    book: {
      id: book.id,
      title: book.title,
      courseId: book.courseId,
      sourceKind: book.sourceKind as
        | 'WEBBOOK_URL'
        | 'EPUB'
        | 'PRESSBOOKS_XML'
        | 'PDF',
    },
    chapter: {
      id: chapter.id,
      title: chapter.title,
      slug: chapter.slug,
      partTitle: chapter.partTitle,
      position: chapter.position,
      parentId: chapter.parentId,
      level: chapter.level,
      markdown: chapter.markdown,
      html: chapter.html,
    },
    toc: siblings,
    prev,
    next,
  };
}
