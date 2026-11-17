import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { listProfessorSections } from '@/lib/professor/sections';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Sections the caller teaches, split into active and archived (concluded). */
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

    const sections = await listProfessorSections(auth.user);
    return NextResponse.json(sections);
  },
);
