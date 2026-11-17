import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { getBookDetail, softDeleteBook } from '@/lib/books';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const GET = route<{ bookId: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { bookId } = params;
    const detail = await getBookDetail(auth.user, bookId);
    return NextResponse.json(detail);
  },
);

export const DELETE = route<{ bookId: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-books-write:${auth.user.id}`,
      limit: 20,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { bookId } = params;
    const meta = extractRequestMeta(req);
    await softDeleteBook(auth.user, bookId, meta);
    return NextResponse.json({ ok: true });
  },
);
