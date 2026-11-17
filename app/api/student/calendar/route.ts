import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { route } from '@/lib/api/route';
import { listStudentQuizDueEvents } from '@/lib/student/quizCalendar';

export const dynamic = 'force-dynamic';

export const GET = route({ auth: 'entitledLearner' }, async ({ user }) => {
  const limited = await enforceRateLimit({
    key: `student-calendar:${user.id}`,
    limit: 60,
    windowMs: 60_000,
    prefix: 'rl',
  });
  if (limited) return limited;
  return NextResponse.json({ events: await listStudentQuizDueEvents(user.id) });
});
