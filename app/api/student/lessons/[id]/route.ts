import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { route } from '@/lib/api/route';
import { getStudentLessonDetail } from '@/lib/learning';

export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>({ auth: 'entitledLearner' }, async ({ params, user }) => {
  const limited = await enforceRateLimit({
    key: `student-lessons:${user.id}`,
    limit: 60,
    windowMs: 60_000,
    prefix: 'rl',
  });
  if (limited) return limited;
  return NextResponse.json({ lesson: await getStudentLessonDetail(user.id, params.id) });
});
