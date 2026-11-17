import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { route } from '@/lib/api/route';
import { upsertLessonProgress } from '@/lib/learning';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['STARTED', 'COMPLETED']),
});

export const POST = route<{ id: string }, typeof bodySchema>(
  { auth: 'entitledLearner', body: bodySchema },
  async ({ params, user, body }) => {
    const limited = await enforceRateLimit({
      key: `student-lessons-write:${user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;
    const progress = await upsertLessonProgress(user.id, params.id, body.status);
    return NextResponse.json({ progress });
  },
);
