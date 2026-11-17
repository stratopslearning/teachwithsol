import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { acceptSwitchUp, proposeSwitchUp } from '@/lib/authoring/switchUp';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const proposeSchema = z.object({
  itemIds: z.array(z.string().uuid()).optional(),
});

const acceptSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        body: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
});

/** Propose switch-up diffs (GET-like via POST body action). */
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
    const raw = await req.json();
    const action = raw?.action === 'accept' ? 'accept' : 'propose';
    const meta = extractRequestMeta(req);

    if (action === 'accept') {
      const body = acceptSchema.parse(raw);
      const outline = await acceptSwitchUp(
        auth.user,
        {
          outlineId: id,
          items: body.items.map((i) => ({
            itemId: i.itemId,
            title: i.title,
            body: i.body as Parameters<typeof acceptSwitchUp>[1]['items'][0]['body'],
          })),
        },
        meta,
      );
      return NextResponse.json({ outline });
    }

    const body = proposeSchema.parse(raw);
    const result = await proposeSwitchUp(
      auth.user,
      { outlineId: id, itemIds: body.itemIds },
      meta,
    );
    return NextResponse.json(result);
  },
);
