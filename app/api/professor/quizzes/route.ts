import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { listProfessorQuizzes } from '@/lib/professor/quizzes';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Quizzes assigned to sections the caller teaches, with summary stats. */
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

    const quizzes = await listProfessorQuizzes(auth.user);
    return NextResponse.json({ quizzes });
  },
);
