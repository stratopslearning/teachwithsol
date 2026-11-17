import { NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';
import { assertCanManageBook } from '@/lib/books/access';
import { getMaterialObjectBytes } from '@/lib/knowledge/storage';
import { route } from '@/lib/api/route';

/** Streams the PDF book original for faculty reader preview. */
export const GET = route<{ bookId: string }>(
  { auth: 'teaching' },
  async ({ params, user }) => {
    const { bookId } = params;
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
  },
);
