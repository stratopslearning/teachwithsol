import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { resolveRegradeRequestForProfessor } from '@/lib/regradeRequests';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const POST = route<{ requestId: string }>(
  { auth: { professorApi: 'grades:write' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;

    const limited = await enforceRateLimit({
      key: `professor-regrade-resolve:${auth.user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { requestId } = params;
    const updated = await resolveRegradeRequestForProfessor({
      requestId,
      professorId: auth.user.id,
    });

    const meta = extractRequestMeta(req);
    await logAudit({
      actorUserId: auth.user.id,
      actorClerkId: auth.user.clerkId,
      action: 'education.regrade.resolve',
      targetType: 'regrade_request',
      targetId: requestId,
      metadata: { attemptId: updated.attemptId },
      ...meta,
    });

    return NextResponse.json({ request: updated });
  },
);
