import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { listProfessorDiscussions } from '@/lib/professor/discussions';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Discussion bots the caller owns, plus duplicatable templates. */
export const GET = route(
  { auth: { professorApi: 'read' } },
  async ({ apiAuth }) => {
    const auth = apiAuth!;

    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const discussions = await listProfessorDiscussions(auth.user);
    return NextResponse.json({ discussions });
  },
);
