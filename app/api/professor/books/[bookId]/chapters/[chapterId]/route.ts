import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { softDeleteChapter } from '@/lib/books';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const DELETE = route<{ bookId: string; chapterId: string }>(
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

    const { bookId, chapterId } = params;
    const meta = extractRequestMeta(req);
    await softDeleteChapter(auth.user, bookId, chapterId, meta);
    return NextResponse.json({ ok: true });
  },
);
