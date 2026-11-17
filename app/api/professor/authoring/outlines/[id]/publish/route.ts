import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { publishOutlineItems } from '@/lib/authoring/publish';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const bodySchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(40),
  sectionIds: z.array(z.string().uuid()).optional(),
});

export const POST = route<{ id: string }>(
  { auth: { professorApi: 'authoring:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-authoring-bulk-publish:${auth.user.id}`,
      limit: 8,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { id } = params;
    const json = bodySchema.parse(await req.json());
    const meta = extractRequestMeta(req);
    const result = await publishOutlineItems(
      auth.user,
      id,
      json.itemIds,
      { sectionIds: json.sectionIds },
      meta,
    );
    return NextResponse.json(result);
  },
);
