import { createHash, randomBytes } from 'crypto';
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { users } from '@/app/db/schema';
import { upsertRoleBinding } from '@/lib/authz/bindings';
import type { BindingRole } from '@/lib/authz/permissions';
import { withBasePath } from '@/lib/basePath';
import { ensureWorkspaceMembership } from '@/lib/workspace/access';
import { rowsFromExecute } from '@/lib/db/rows';

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export type WorkspaceInviteRole = 'owner' | 'admin' | 'instructor';

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function mintInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function buildClaimUrl(token: string, baseUrl?: string): string {
  const path = withBasePath(`/workspaces/claim?token=${encodeURIComponent(token)}`);
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

type WorkspaceInviteRow = {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token_hash: string;
  expires_at: Date;
  claimed_at: Date | null;
  claimed_by_user_id: string | null;
  created_at: Date;
  workspace_name: string | null;
};

/**
 * Mint a one-time claim invite. Used by platform admin (owner provision) and
 * workspace owners (faculty invites). Plain token is returned once; only the
 * hash is stored.
 */
export async function createWorkspaceOwnerInvite(opts: {
  workspaceId: string;
  email: string;
  role?: WorkspaceInviteRole;
  baseUrl?: string;
}): Promise<{ inviteId: string; token: string; claimUrl: string; expiresAt: Date }> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Valid email is required');
  }

  const role: WorkspaceInviteRole = opts.role ?? 'owner';
  const token = mintInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const { createWorkspaceInviteDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  const invite = await createWorkspaceInviteDefiner({
    workspaceId: opts.workspaceId,
    email,
    role,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
  });

  // If the user already exists, stage an invited membership.
  const existing = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
  });
  if (existing) {
    await ensureWorkspaceMembership({
      workspaceId: opts.workspaceId,
      userId: existing.id,
      status: 'invited',
    });
  }

  return {
    inviteId: invite.id,
    token,
    claimUrl: buildClaimUrl(token, opts.baseUrl),
    expiresAt: invite.expiresAt,
  };
}

/** Alias — same mint helper; name reflects faculty/owner use. */
export const createWorkspaceInvite = createWorkspaceOwnerInvite;

export type ClaimResult =
  | { ok: true; workspaceId: string; workspaceName: string }
  | { ok: false; error: string; status: 400 | 403 | 404 | 410 };

export type InvitePeek =
  | {
      ok: true;
      email: string;
      workspaceName: string;
      role: string;
      claimed: boolean;
      expired: boolean;
    }
  | { ok: false; error: string };

/** Resolve invite metadata for the claim page without consuming the token. */
export async function peekWorkspaceInvite(token: string): Promise<InvitePeek> {
  const tokenHash = hashInviteToken(token);
  const invite = rowsFromExecute<WorkspaceInviteRow>(
    await db.execute(
      sql`SELECT * FROM sol_find_workspace_invite_by_token(${tokenHash})`,
    ),
  )[0];
  if (!invite) {
    return { ok: false, error: 'Invite not found or already revoked' };
  }
  return {
    ok: true,
    email: invite.email,
    workspaceName: invite.workspace_name ?? 'Workspace',
    role: invite.role,
    claimed: Boolean(invite.claimed_at),
    expired: new Date(invite.expires_at).getTime() < Date.now(),
  };
}

/**
 * Claim an invite for the signed-in user. Email must match.
 * Consumes the invite atomically before granting membership/bindings.
 */
export async function claimWorkspaceInvite(opts: {
  token: string;
  user: { id: string; email: string; clerkId: string };
}): Promise<ClaimResult> {
  const tokenHash = hashInviteToken(opts.token);
  const found = rowsFromExecute<WorkspaceInviteRow>(
    await db.execute(
      sql`SELECT * FROM sol_find_workspace_invite_by_token(${tokenHash})`,
    ),
  )[0];
  if (!found) {
    return { ok: false, error: 'Invite not found', status: 404 };
  }
  if (found.claimed_at) {
    return { ok: false, error: 'Invite already claimed', status: 410 };
  }
  if (new Date(found.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Invite expired', status: 410 };
  }

  const sessionEmail = opts.user.email.trim().toLowerCase();
  if (!sessionEmail || sessionEmail !== found.email.toLowerCase()) {
    return {
      ok: false,
      error: 'Sign in with the invited email address to claim this invite',
      status: 403,
    };
  }

  const claimed = rowsFromExecute<{
    id: string;
    workspace_id: string;
    email: string;
    role: string;
    expires_at: Date;
    workspace_name: string | null;
  }>(
    await db.execute(
      sql`SELECT * FROM sol_claim_workspace_invite(${tokenHash}, ${opts.user.id}::uuid)`,
    ),
  )[0];
  if (!claimed) {
    return { ok: false, error: 'Invite already claimed', status: 410 };
  }

  const bindingRole: BindingRole =
    claimed.role === 'owner'
      ? 'owner'
      : claimed.role === 'admin'
        ? 'admin'
        : 'faculty';

  await ensureWorkspaceMembership({
    workspaceId: claimed.workspace_id,
    userId: opts.user.id,
    status: 'active',
  });

  await upsertRoleBinding({
    tenantId: claimed.workspace_id,
    userId: opts.user.id,
    scopeType: 'organization',
    scopeId: claimed.workspace_id,
    role: bindingRole,
  });

  return {
    ok: true,
    workspaceId: claimed.workspace_id,
    workspaceName: claimed.workspace_name ?? 'Workspace',
  };
}
