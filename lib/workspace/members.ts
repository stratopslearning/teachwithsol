import { and, eq, isNull } from 'drizzle-orm';

import { withTenant } from '@/lib/db/tenantContext';
import {
  roleBindings,
  workspaceInvites,
  workspaceMemberships,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { userCanInviteWorkspaceFaculty } from '@/lib/workspace/entitlement';

/** Soft-remove a non-owner member (status → removed). Owner/admin only. */
export async function removeWorkspaceMember(opts: {
  actorUserId: string;
  workspaceId: string;
  membershipId: string;
}): Promise<void> {
  const can = await userCanInviteWorkspaceFaculty(
    opts.actorUserId,
    opts.workspaceId,
  );
  if (!can) {
    throw ApiError.forbidden('Only the workspace owner or admin can remove members');
  }

  // FORCE RLS: plain db reads/updates saw no rows (always "not found").
  // Run under the workspace's tenant.
  await withTenant(opts.workspaceId, opts.actorUserId, async (tx) => {
    const membership = await tx.query.workspaceMemberships.findFirst({
      where: and(
        eq(workspaceMemberships.id, opts.membershipId),
        eq(workspaceMemberships.workspaceId, opts.workspaceId),
      ),
    });
    if (!membership) throw ApiError.notFound('Member not found');
    const ownerBinding = await tx.query.roleBindings.findFirst({
      where: and(
        eq(roleBindings.tenantId, opts.workspaceId),
        eq(roleBindings.userId, membership.userId),
        eq(roleBindings.scopeType, 'organization'),
        eq(roleBindings.scopeId, opts.workspaceId),
        eq(roleBindings.role, 'owner'),
        isNull(roleBindings.revokedAt),
      ),
      columns: { id: true },
    });
    if (ownerBinding) {
      throw ApiError.badRequest('Cannot remove the workspace owner');
    }
    if (membership.userId === opts.actorUserId) {
      throw ApiError.badRequest('Cannot remove yourself');
    }

    await tx
      .update(workspaceMemberships)
      .set({ status: 'removed', updatedAt: new Date() })
      .where(eq(workspaceMemberships.id, membership.id));
  });
}

/** Expire an unclaimed invite. Owner/admin only. */
export async function revokeWorkspaceInvite(opts: {
  actorUserId: string;
  workspaceId: string;
  inviteId: string;
}): Promise<void> {
  const can = await userCanInviteWorkspaceFaculty(
    opts.actorUserId,
    opts.workspaceId,
  );
  if (!can) {
    throw ApiError.forbidden('Only the workspace owner or admin can revoke invites');
  }

  // FORCE RLS: plain db reads/updates saw no rows (always "not found").
  // Run under the workspace's tenant.
  await withTenant(opts.workspaceId, opts.actorUserId, async (tx) => {
    const invite = await tx.query.workspaceInvites.findFirst({
      where: and(
        eq(workspaceInvites.id, opts.inviteId),
        eq(workspaceInvites.workspaceId, opts.workspaceId),
        isNull(workspaceInvites.claimedAt),
      ),
    });
    if (!invite) throw ApiError.notFound('Invite not found');
    if (invite.role === 'owner') {
      throw ApiError.badRequest('Cannot revoke an owner provision invite here');
    }

    await tx
      .update(workspaceInvites)
      .set({ expiresAt: new Date() })
      .where(eq(workspaceInvites.id, invite.id));
  });
}
