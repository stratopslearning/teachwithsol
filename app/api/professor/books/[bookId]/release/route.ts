import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { releaseBook } from '@/lib/books';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sectionIds: z.array(z.string().uuid()).optional(),
});

export const POST = route<{ bookId: string }>(
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
    let sectionIds: string[] | undefined;
    try {
      const json = bodySchema.parse(await req.json());
      sectionIds = json.sectionIds;
    } catch {
      sectionIds = undefined;
    }

    const book = await releaseBook(
      auth.user,
      bookId,
      { sectionIds },
      meta,
    );
    return NextResponse.json({ book });
  },
);
