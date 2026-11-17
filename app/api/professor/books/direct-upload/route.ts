import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import {
  beginBookDirectUpload,
  completeBookDirectUpload,
} from '@/lib/books';
import { MAX_BOOK_UPLOAD_BYTES } from '@/lib/books/constants';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const beginSchema = z.object({
  courseId: z.string().uuid(),
  fileName: z.string().min(1).max(260),
  mimeType: z.string().max(200).optional(),
  byteSize: z.number().int().positive().max(MAX_BOOK_UPLOAD_BYTES),
  title: z.string().min(1).max(200).optional(),
});

const completeSchema = z.object({
  bookId: z.string().uuid(),
  expectedByteSize: z.number().int().positive().optional(),
});

/** Begin (JSON) or complete a browser → S3 book upload. */
export const POST = route(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-books-write:${auth.user.id}`,
      limit: 20,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const meta = extractRequestMeta(req);
    const body = await req.json();
    const action = typeof body?.action === 'string' ? body.action : 'begin';

    if (action === 'complete') {
      const parsed = completeSchema.parse(body);
      const book = await completeBookDirectUpload(
        auth.user,
        {
          bookId: parsed.bookId,
          expectedByteSize: parsed.expectedByteSize,
        },
        meta,
      );
      return NextResponse.json({ book }, { status: 201 });
    }

    const parsed = beginSchema.parse(body);
    const started = await beginBookDirectUpload(auth.user, {
      courseId: parsed.courseId,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType || 'application/octet-stream',
      byteSize: parsed.byteSize,
      title: parsed.title,
    });
    return NextResponse.json(started);
  },
);
