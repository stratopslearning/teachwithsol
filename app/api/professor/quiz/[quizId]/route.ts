import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { getProfessorQuiz } from '@/lib/professor/quizzes';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Quiz detail with questions (answer keys only for the owner / admins). */
export const GET = route<{ quizId: string }>(
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

    const { quizId } = params;
    const quiz = await getProfessorQuiz(auth.user, quizId);
    return NextResponse.json({ quiz });
  },
);
