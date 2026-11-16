import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getWorkspaceName } from '@/lib/workspace/name';
import { ApiError, jsonError } from '@/lib/api/errors';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { sendWorkspaceInviteMail } from '@/lib/email';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { decideAccessRequest } from '@/lib/workspace/accessRequests';
import { WORKSPACE_GRANTABLE_ROLES } from '@/app/db/enums';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  decision: z.enum(['approved', 'rejected', 'blocked']),
  note: z.string().max(500).optional(),
  /** Approver-chosen role when approving. Defaults to instructor. */
  role: z.enum(WORKSPACE_GRANTABLE_ROLES).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: {
    params: Promise<{ workspaceId: string; requestId: string }>;
  },
) {
  try {
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await enforceRateLimit({
      key: `access-decide:${user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { workspaceId, requestId } = await ctx.params;
    const parsed = bodySchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const result = await decideAccessRequest({
      requestId,
      workspaceId,
      actorUserId: user.id,
      decision: parsed.data.decision,
      note: parsed.data.note,
      role: parsed.data.role,
    });

    let emailSent = false;
    if (
      parsed.data.decision === 'approved' &&
      result.claimUrl &&
      result.email &&
      result.expiresAt
    ) {
      const workspace = { name: await getWorkspaceName(workspaceId) };
      const emailResult = await sendWorkspaceInviteMail({
        workspaceId,
        to: result.email,
        workspaceName: workspace?.name ?? 'your workspace',
        role: result.role ?? 'instructor',
        claimUrl: result.claimUrl,
        expiresAt: result.expiresAt,
      });
      emailSent =
        emailResult.ok && !('skipped' in emailResult && emailResult.skipped);
    }

    return NextResponse.json({
      success: true,
      claimUrl: result.claimUrl,
      emailSent,
    });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error);
    console.error('[access-requests PATCH]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
