import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiErrorResponse } from '@/lib/api/errors';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { refineOutlineChat } from '@/lib/authoring/refine';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
// Multi-step agent turns can write whole quizzes; allow the full window.
export const maxDuration = 300;

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  focusItemId: z.string().uuid().optional(),
  materialIds: z.array(z.string().uuid()).max(40).optional(),
  /** Confirm / Cancel buttons on an action the agent asked about. */
  confirmPending: z.boolean().optional(),
  cancelPending: z.boolean().optional(),
});

/**
 * Authoring chat turn. With `Accept: application/x-ndjson` the response is a
 * stream of JSON lines: `{type:"step",label}` as the agent works, then one
 * `{type:"done",result}` or `{type:"error",error,status}`. Otherwise plain JSON.
 */
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
    const input = {
      outlineId: id,
      message: body.message,
      focusItemId: body.focusItemId,
      materialIds: body.materialIds,
      confirmPending: body.confirmPending,
      cancelPending: body.cancelPending,
    };

    if (!(req.headers.get('accept') ?? '').includes('application/x-ndjson')) {
      return NextResponse.json(await refineOutlineChat(auth.user, input, meta));
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          const result = await refineOutlineChat(
            auth.user,
            { ...input, onStep: (label) => send({ type: 'step', label }) },
            meta,
          );
          send({ type: 'done', result });
        } catch (error) {
          const res = apiErrorResponse(error);
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          send({ type: 'error', status: res.status, error: payload.error ?? 'Something went wrong' });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  },
);
