import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getWorkspaceName } from '@/lib/workspace/name';
import { apiErrorResponse } from '@/lib/api/errors';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { sendWorkspaceInviteMail } from '@/lib/email';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { appBaseUrl } from '@/lib/siteUrl';
import {
  createWorkspaceInvite,
  userCanInviteWorkspaceFaculty,
} from '@/lib/workspace';
import { WORKSPACE_GRANTABLE_ROLES } from '@/app/db/enums';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().email().max(320),
  /** Owner/admin may invite instructors or co-admins (never owner). */
  role: z.enum(WORKSPACE_GRANTABLE_ROLES).optional(),
});

/**
 * Workspace owner/admin invites faculty by email → one-time claim link.
 * Platform admin provisioning of owners stays on /api/admin/workspaces.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ workspaceId: string }> },
) {
  const user = await getOrCreateUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { workspaceId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    return NextResponse.json({ error: 'Invalid workspace id' }, { status: 400 });
  }

  const canInvite = await userCanInviteWorkspaceFaculty(user.id, workspaceId);
  if (!canInvite) {
    return NextResponse.json(
      { error: 'Only the workspace owner or admin can invite faculty' },
      { status: 403 },
    );
  }

  try {
    const { requireWorkspaceTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireWorkspaceTeaching(workspaceId, user);
  } catch (error) {
    return apiErrorResponse(error);
  }

  const limited = await enforceRateLimit({
    key: `ws-invite:${user.id}`,
    limit: 30,
    windowMs: 60_000,
    prefix: 'rl',
    message: 'Too many invites. Please wait a moment.',
  });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (email === user.email.trim().toLowerCase()) {
    return NextResponse.json(
      { error: 'You are already a member of this workspace' },
      { status: 400 },
    );
  }

  const baseUrl = appBaseUrl();

  const role = parsed.data.role ?? 'instructor';

  try {
    const invite = await createWorkspaceInvite({
      workspaceId,
      email,
      role,
      baseUrl,
    });

    const workspace = { name: await getWorkspaceName(workspaceId) };

    const emailResult = await sendWorkspaceInviteMail({
      workspaceId,
      to: email,
      workspaceName: workspace?.name ?? 'your workspace',
      role,
      claimUrl: invite.claimUrl,
      expiresAt: invite.expiresAt,
    });

    return NextResponse.json({
      success: true,
      invite: {
        email,
        role,
        claimUrl: invite.claimUrl,
        expiresAt: invite.expiresAt.toISOString(),
      },
      emailSent: emailResult.ok && !('skipped' in emailResult && emailResult.skipped),
      emailSkipped: Boolean(
        emailResult.ok && 'skipped' in emailResult && emailResult.skipped,
      ),
      emailError: emailResult.ok ? undefined : emailResult.error,
    });
  } catch (error) {
    console.error('[workspaces/invites POST]', error);
    return apiErrorResponse(error);
  }
}
