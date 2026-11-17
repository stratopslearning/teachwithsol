import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { listQuizAttempts } from '@/lib/professor/grading';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Submitted attempts for a quiz, scoped to sections the caller teaches. */
export const GET = route<{ quizId: string }>(
  { auth: { professorApi: 'read' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;

    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { quizId } = params;
    const sectionId = new URL(req.url).searchParams.get('sectionId');
    const attempts = await listQuizAttempts(auth.user, quizId, {
      sectionId: sectionId ?? undefined,
    });
    return NextResponse.json({ attempts });
  },
);
