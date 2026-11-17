import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { refineOutlineChat } from '@/lib/authoring/refine';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  focusItemId: z.string().uuid().optional(),
  materialIds: z.array(z.string().uuid()).max(40).optional(),
});

export const POST = route<{ id: string }>(
  { auth: { professorApi: 'authoring:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-authoring-chat:${auth.user.id}`,
      limit: 20,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { id } = params;
    const body = chatSchema.parse(await req.json());
    const meta = extractRequestMeta(req);
    const result = await refineOutlineChat(
      auth.user,
      {
        outlineId: id,
        message: body.message,
        focusItemId: body.focusItemId,
        materialIds: body.materialIds,
      },
      meta,
    );
    return NextResponse.json(result);
  },
);
