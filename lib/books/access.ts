import { ApiError } from '@/lib/api/errors';
import {
  fetchBookChapterForReaderDefiner,
  fetchBookSectionIdsDefiner,
  fetchHostedBookByIdDefiner,
  fetchActiveSectionIdsForStudentDefiner,
} from '@/lib/db/bookWriteDefiners';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';

export async function assertCanManageBook(user: AuthUser, bookId: string) {
  const book = await fetchHostedBookByIdDefiner(bookId);
  if (!book || book.deletedAt) throw ApiError.notFound('Book not found');
  await assertCanManageCourse(user, book.courseId);
  return book;
}

/** Student may access a released book assigned to one of their active sections. */
export async function assertStudentCanAccessBook(
  studentId: string,
  bookId: string,
) {
  const book = await fetchHostedBookByIdDefiner(bookId);
  if (!book || book.deletedAt || !book.isReleased || book.status !== 'READY') {
    throw ApiError.notFound('Book not found');
  }

  const sectionIds = await fetchBookSectionIdsDefiner(bookId);
  if (sectionIds.length === 0) throw ApiError.forbidden('Book not assigned');

  const enrolled = new Set(
    await fetchActiveSectionIdsForStudentDefiner(studentId),
  );
  const ok = sectionIds.some((id) => enrolled.has(id));
  if (!ok) throw ApiError.forbidden('You are not enrolled in this book');

  return book;
}

export async function assertStudentCanAccessChapter(
  studentId: string,
  chapterId: string,
) {
  const chapter = await fetchBookChapterForReaderDefiner(chapterId);
  if (!chapter) throw ApiError.notFound('Chapter not found');
  const book = await assertStudentCanAccessBook(studentId, chapter.bookId);
  return { book, chapter };
}
