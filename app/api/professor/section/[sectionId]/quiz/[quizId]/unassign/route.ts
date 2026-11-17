import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { unassignQuizFromSection } from '@/lib/professor/mutations';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const POST = route<{ sectionId: string; quizId: string }>(
  { auth: { professorApi: 'sections:write' } },
  async ({ params, user }) => {

    const limited = await enforceRateLimit({
      key: `quiz-unassign:${user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
      message: 'Too many unassign requests. Please wait a moment.',
    });
    if (limited) return limited;

    const { sectionId, quizId } = params;
    await unassignQuizFromSection(user, sectionId, quizId);

    return NextResponse.json({ success: true });
  },
);
