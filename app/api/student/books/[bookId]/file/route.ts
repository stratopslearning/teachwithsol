import { NextResponse } from 'next/server';

import { ApiError, apiErrorResponse } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/sessionAuth';
import { assertStudentCanAccessBook } from '@/lib/books/access';
import { getMaterialObjectBytes } from '@/lib/knowledge/storage';

/** Streams the PDF (or other) book original for the student reader. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ bookId: string }> },
) {
  try {
    const user = await requireApiUser();
    const { bookId } = await ctx.params;
    const book = await assertStudentCanAccessBook(user.id, bookId);
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
  } catch (err) {
    return apiErrorResponse(err);
  }
}
