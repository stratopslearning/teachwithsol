import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { getSectionGradebook } from '@/lib/professor/grading';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Section gradebook matrix (best score per learner): audited disclosure. */
export const GET = route<{ sectionId: string }>(
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

    const { sectionId } = params;
    const gradebook = await getSectionGradebook(auth.user, sectionId);
    return NextResponse.json({ gradebook });
  },
);
