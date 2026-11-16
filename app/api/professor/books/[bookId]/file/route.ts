import { NextResponse } from 'next/server';

import { ApiError, apiErrorResponse } from '@/lib/api/errors';
import { requireTeachingApi } from '@/lib/api/sessionAuth';
import { assertCanManageBook } from '@/lib/books/access';
import { getMaterialObjectBytes } from '@/lib/knowledge/storage';

/** Streams the PDF book original for faculty reader preview. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ bookId: string }> },
) {
  try {
    const user = await requireTeachingApi();
    const { bookId } = await ctx.params;
    const book = await assertCanManageBook(user, bookId);
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
