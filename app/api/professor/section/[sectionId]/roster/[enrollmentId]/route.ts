import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { dropStudentFromSection } from '@/lib/professor/roster';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Soft-remove a learner from the section roster. */
export const DELETE = route<{ sectionId: string; enrollmentId: string }>(
  { auth: { professorApi: 'sections:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-sections-write:${auth.user.id}`,
      limit: 40,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { sectionId, enrollmentId } = params;
    const meta = extractRequestMeta(req);
    await dropStudentFromSection(
      auth.user,
      { sectionId, enrollmentId },
      meta,
    );
    return NextResponse.json({ ok: true });
  },
);
