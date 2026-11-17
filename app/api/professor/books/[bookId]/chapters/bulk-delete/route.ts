import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { softDeleteChapters } from '@/lib/books';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  chapterIds: z.array(z.string().uuid()).min(1).max(500),
});

export const POST = route<{ bookId: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-books-write:${auth.user.id}`,
      limit: 40,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { bookId } = params;
    const body = bodySchema.parse(await req.json());
    const meta = extractRequestMeta(req);
    const result = await softDeleteChapters(
      auth.user,
      bookId,
      body.chapterIds,
      meta,
    );
    return NextResponse.json(result);
  },
);
