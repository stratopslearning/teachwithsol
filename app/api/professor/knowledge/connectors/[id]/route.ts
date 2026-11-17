import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import {
  disconnectConnector,
  listRecentSyncRuns,
  scheduleConnectorSync,
  updateConnectorConfig,
} from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const patchSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

export const GET = route<{ id: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    const runs = await listRecentSyncRuns(auth.user, id);
    return NextResponse.json({ runs });
  },
);

export const PATCH = route<{ id: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    const body = patchSchema.parse(await req.json());
    const connector = await updateConnectorConfig(auth.user, id, body.config);
    return NextResponse.json({ connector });
  },
);

export const POST = route<{ id: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-knowledge-write:${auth.user.id}`,
      limit: 10,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { id } = params;
    const action = req.nextUrl.searchParams.get('action') ?? 'sync';
    if (action === 'sync') {
      await scheduleConnectorSync(auth.user, id);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  },
);

export const DELETE = route<{ id: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    await disconnectConnector(auth.user, id);
    return NextResponse.json({ success: true });
  },
);
