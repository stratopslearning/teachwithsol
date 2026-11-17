import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { publishOutlineItem } from '@/lib/authoring/publish';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  sectionIds: z.array(z.string().uuid()).optional(),
});

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
    const json = bodySchema.parse(
      (await req.json().catch(() => ({}))) as unknown,
    );
    const meta = extractRequestMeta(req);
    const item = await publishOutlineItem(
      auth.user,
      itemId,
      { sectionIds: json.sectionIds },
      meta,
    );
    return NextResponse.json({ item });
  },
);
