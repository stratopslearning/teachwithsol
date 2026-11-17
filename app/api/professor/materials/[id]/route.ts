import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import {
  getCourseMaterial,
  softDeleteMaterial,
} from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    const material = await getCourseMaterial(auth.user, id);
    return NextResponse.json({ material });
  },
);

export const DELETE = route<{ id: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-materials-write:${auth.user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { id } = params;
    const meta = extractRequestMeta(req);
    await softDeleteMaterial(auth.user, id, meta);
    return NextResponse.json({ success: true });
  },
);
