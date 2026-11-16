import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/app/db';
import { users, workspaces } from '@/app/db/schema';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { parseEmailListFromCsv } from '@/lib/csv/parseEmailList';
import { sendWorkspaceInviteMail } from '@/lib/email';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { appBaseUrl } from '@/lib/siteUrl';
import {
  createWorkspaceInvite,
  getActiveWorkspaceId,
  userCanInviteWorkspaceFaculty,
} from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  csv: z.string().min(1).max(500_000),
});

export async function POST(req: NextRequest) {
  const user = await getOrCreateUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = await enforceRateLimit({
    key: `faculty-import:${user.id}`,
    limit: 10,
    windowMs: 60_000,
    prefix: 'rl',
  });
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const workspaceId =
    parsed.data.workspaceId ?? (await getActiveWorkspaceId(user.id));
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }

  const canInvite = await userCanInviteWorkspaceFaculty(user.id, workspaceId);
  if (!canInvite) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { requireWorkspaceTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireWorkspaceTeaching(workspaceId, user);
  } catch (error) {
    const { apiErrorResponse } = await import('@/lib/api/errors');
    return apiErrorResponse(error);
  }

  const emails = parseEmailListFromCsv(parsed.data.csv);
  if (emails.length === 0) {
    return NextResponse.json({ error: 'No valid emails in CSV' }, { status: 400 });
  }

  const baseUrl = appBaseUrl();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { name: true },
  });

  const results: Array<{
    email: string;
    ok: boolean;
    error?: string;
    claimUrl?: string;
    emailSent?: boolean;
  }> = [];

  for (const email of emails) {
    if (email === user.email.trim().toLowerCase()) {
      results.push({ email, ok: false, error: 'Skipped self' });
      continue;
    }
    const existing = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    });
    if (!existing) {
      results.push({
        email,
        ok: false,
        error: 'No SOL account — sign-in required before invite',
      });
      continue;
    }
    try {
      const invite = await createWorkspaceInvite({
        workspaceId,
        email,
        role: 'instructor',
        baseUrl,
      });
      const emailResult = await sendWorkspaceInviteMail({
        workspaceId,
        to: email,
        workspaceName: workspace?.name ?? 'your workspace',
        role: 'instructor',
        claimUrl: invite.claimUrl,
        expiresAt: invite.expiresAt,
      });
      results.push({
        email,
        ok: true,
        claimUrl: invite.claimUrl,
        emailSent:
          emailResult.ok && !('skipped' in emailResult && emailResult.skipped),
      });
    } catch (err) {
      results.push({
        email,
        ok: false,
        error: err instanceof Error ? err.message : 'Invite failed',
      });
    }
  }

  const invited = results.filter((r) => r.ok).length;
  return NextResponse.json({
    success: true,
    invited,
    failed: results.length - invited,
    results,
  });
}
