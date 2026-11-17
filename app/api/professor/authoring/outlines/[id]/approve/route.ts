import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { approveAndBuildOutline } from '@/lib/authoring/propose';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = route<{ id: string }>(
  { auth: { professorApi: 'authoring:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-authoring-write:${auth.user.id}`,
      limit: 10,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { id } = params;
    const meta = extractRequestMeta(req);
    const outline = await approveAndBuildOutline(auth.user, id, meta);
    return NextResponse.json({ outline });
  },
);
