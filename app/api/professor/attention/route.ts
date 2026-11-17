import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { getAttentionItemsForProfessor } from '@/lib/professor/attention';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Attempts needing grading attention in sections the caller teaches. */
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

    const limitParam = new URL(req.url).searchParams.get('limit');
    const items = await getAttentionItemsForProfessor(auth.user.id, {
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return NextResponse.json({ items });
  },
);
