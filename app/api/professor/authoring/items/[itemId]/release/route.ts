import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { releaseOutlineItem } from '@/lib/authoring/publish';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const POST = route<{ itemId: string }>(
  { auth: { professorApi: 'authoring:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-authoring-write:${auth.user.id}`,
      limit: 20,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { itemId } = params;
    const meta = extractRequestMeta(req);
    const item = await releaseOutlineItem(auth.user, itemId, meta);
    return NextResponse.json({ item });
  },
);
