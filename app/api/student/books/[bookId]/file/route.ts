import { NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';
import { route } from '@/lib/api/route';
import { assertStudentCanAccessBook } from '@/lib/books/access';
import { getMaterialObjectBytes } from '@/lib/knowledge/storage';

/** Streams the PDF (or other) book original for the student reader. */
export const GET = route<{ bookId: string }>({ auth: 'user' }, async ({ params, user }) => {
  const book = await assertStudentCanAccessBook(user.id, params.bookId);
  if (book.sourceKind !== 'PDF') {
    throw ApiError.badRequest('This book is not a PDF');
  }
  if (!book.s3Key) {
    throw ApiError.notFound('PDF file not found');
  }
  const buf = await getMaterialObjectBytes(book.s3Key);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="book.pdf"',
      'Cache-Control': 'private, max-age=60',
    },
  });
});
