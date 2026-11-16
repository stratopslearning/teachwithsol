import { and, eq, gte } from 'drizzle-orm';

import { db } from '@/app/db';
import { users, workspaceAccessRequests } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { withTenant } from '@/lib/db/tenantContext';
import { createWorkspaceInvite } from '@/lib/workspace/invites';
import { userCanInviteWorkspaceFaculty } from '@/lib/workspace/entitlement';
import { appBaseUrl } from '@/lib/siteUrl';

export type AccessRequestRole = 'instructor' | 'admin';
export type AccessRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'blocked';

function mapAccessRequestRow(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    workspaceId: String(raw.workspace_id ?? raw.workspaceId),
    email: String(raw.email),
    name: (raw.name as string | null) ?? null,
    claimedRole: (raw.claimed_role ?? raw.claimedRole) as AccessRequestRole,
    userId: (raw.user_id ?? raw.userId) as string | null,
    status: String(raw.status) as AccessRequestStatus,
    decidedBy: (raw.decided_by ?? raw.decidedBy) as string | null,
    decidedAt: raw.decided_at || raw.decidedAt
      ? new Date(String(raw.decided_at ?? raw.decidedAt))
      : null,
    note: (raw.note as string | null) ?? null,
    createdAt: new Date(String(raw.created_at ?? raw.createdAt)),
    updatedAt: new Date(String(raw.updated_at ?? raw.updatedAt)),
  };
}

export async function createWorkspaceAccessRequest(opts: {
  workspaceId: string;
  email: string;
  name?: string | null;
  claimedRole?: AccessRequestRole;
  userId?: string | null;
}): Promise<{ id: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!email.includes('@')) {
    throw ApiError.badRequest('Valid email is required');
  }

  const { createAccessRequestDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  try {
    return await createAccessRequestDefiner({
      workspaceId: opts.workspaceId,
      email,
      name: opts.name?.trim() || null,
      claimedRole: opts.claimedRole ?? 'instructor',
      userId: opts.userId ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Workspace not found')) {
      throw ApiError.notFound('Workspace not found');
    }
    throw err;
  }
}

export async function listPendingAccessRequests(
  workspaceId: string,
  _actorUserId?: string | null,
) {
  const { listPendingAccessRequestsDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  const rows = await listPendingAccessRequestsDefiner(workspaceId);
  return rows.map(mapAccessRequestRow);
}

export async function decideAccessRequest(opts: {
  requestId: string;
  workspaceId: string;
  actorUserId: string;
  decision: 'approved' | 'rejected' | 'blocked';
  note?: string | null;
  /** Approver-chosen role on approve. Defaults to instructor; never trusts requester admin. */
  role?: AccessRequestRole;
}): Promise<{ claimUrl?: string; expiresAt?: Date; email?: string; role?: string }> {
  const can = await userCanInviteWorkspaceFaculty(
    opts.actorUserId,
    opts.workspaceId,
  );
  if (!can) {
    throw ApiError.forbidden('Only workspace owner or admin can decide requests');
  }

  const { fetchAccessRequestDefiner, decideAccessRequestDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  const raw = await fetchAccessRequestDefiner({
    requestId: opts.requestId,
    workspaceId: opts.workspaceId,
  });
  if (!raw) throw ApiError.notFound('Request not found');
  const request = mapAccessRequestRow(raw);
  if (request.status !== 'pending') {
    throw ApiError.badRequest('Request is already decided');
  }

  if (opts.decision !== 'approved') {
    await decideAccessRequestDefiner({
      requestId: opts.requestId,
      workspaceId: opts.workspaceId,
      status: opts.decision,
      decidedBy: opts.actorUserId,
      note: opts.note?.trim() || null,
    });
    return {};
  }

  const role: AccessRequestRole =
    opts.role === 'admin' ? 'admin' : 'instructor';

  const baseUrl = appBaseUrl();

  // Mint invite first so a failed invite leaves the request pending (retryable).
  const invite = await createWorkspaceInvite({
    workspaceId: opts.workspaceId,
    email: request.email,
    role,
    baseUrl,
  });

  await decideAccessRequestDefiner({
    requestId: opts.requestId,
    workspaceId: opts.workspaceId,
    status: 'approved',
    decidedBy: opts.actorUserId,
    note: opts.note?.trim() || null,
  });

  return {
    claimUrl: invite.claimUrl,
    expiresAt: invite.expiresAt,
    email: request.email,
    role,
  };
}

export async function accessRequestDigestStats(workspaceId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return withTenant(workspaceId, null, async (tx) => {
    const pending = await tx.query.workspaceAccessRequests.findMany({
      where: and(
        eq(workspaceAccessRequests.workspaceId, workspaceId),
        eq(workspaceAccessRequests.status, 'pending'),
      ),
      columns: { id: true },
    });
    const recent = await tx.query.workspaceAccessRequests.findMany({
      where: and(
        eq(workspaceAccessRequests.workspaceId, workspaceId),
        gte(workspaceAccessRequests.createdAt, since),
      ),
      columns: { id: true, status: true },
    });
    const rejectedRecent = await tx.query.workspaceAccessRequests.findMany({
      where: and(
        eq(workspaceAccessRequests.workspaceId, workspaceId),
        eq(workspaceAccessRequests.status, 'rejected'),
        gte(workspaceAccessRequests.decidedAt, since),
      ),
      columns: { id: true },
    });

    return {
      pendingCount: pending.length,
      newCount: recent.length,
      rejectedCount: rejectedRecent.length,
    };
  });
}

/** Resolve workspace id by slug for public request form. */
export async function findWorkspaceIdBySlug(
  slug: string,
): Promise<string | null> {
  const { findWorkspaceIdBySlugDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  return findWorkspaceIdBySlugDefiner(slug);
}

export async function actorEmail(userId: string): Promise<string | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });
  return row?.email?.trim().toLowerCase() ?? null;
}
