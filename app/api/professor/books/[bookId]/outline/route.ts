import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { createOutlineFromBook } from '@/lib/books';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = route<{ bookId: string }>(
  { auth: { professorApi: 'authoring:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-authoring-write:${auth.user.id}`,
      limit: 10,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { bookId } = params;
    const meta = extractRequestMeta(req);
    const outline = await createOutlineFromBook(auth.user, bookId, meta);
    return NextResponse.json({ outline }, { status: 201 });
  },
);
