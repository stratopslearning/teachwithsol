import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import {
  importBookFromUpload,
  importBookFromUrl,
  listCourseBooks,
} from '@/lib/books';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const urlBodySchema = z.object({
  courseId: z.string().uuid(),
  url: z.string().url(),
  title: z.string().min(1).max(200).optional(),
});

export const GET = route(
  { auth: { professorApi: 'read' } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const courseId = req.nextUrl.searchParams.get('courseId');
    if (!courseId) {
      return NextResponse.json(
        { error: 'courseId is required' },
        { status: 400 },
      );
    }
    const books = await listCourseBooks(auth.user, courseId);
    return NextResponse.json({ books });
  },
);

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
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const courseId = String(form.get('courseId') ?? '');
      const title = form.get('title') ? String(form.get('title')) : undefined;
      const file = form.get('file');
      if (!courseId || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'courseId and file are required' },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const book = await importBookFromUpload(
        auth.user,
        {
          courseId,
          title,
          fileName: file.name || 'book.bin',
          mimeType: file.type || 'application/octet-stream',
          buffer,
        },
        meta,
      );
      return NextResponse.json({ book }, { status: 201 });
    }

    const json = urlBodySchema.parse(await req.json());
    const book = await importBookFromUrl(
      auth.user,
      {
        courseId: json.courseId,
        url: json.url,
        title: json.title,
      },
      meta,
    );
    return NextResponse.json({ book }, { status: 201 });
  },
);
