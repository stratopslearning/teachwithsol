import { and, eq, isNull } from 'drizzle-orm';

import { withTenant } from '@/lib/db/tenantContext';
import { roleBindings } from '@/app/db/schema';
import {
  countActiveOwners,
  revokeRoleBindingMatching,
  upsertRoleBinding,
} from '@/lib/authz/bindings';
import { clearBindingCache } from '@/lib/authz/authorize';
import { ensureWorkspaceMembership } from '@/lib/workspace/access';
import { ApiError } from '@/lib/api/errors';

/**
 * Transfer workspace ownership. Caller must already hold owner binding.
 */
export async function transferWorkspaceOwnership(opts: {
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
}): Promise<void> {
  if (opts.fromUserId === opts.toUserId) {
    throw ApiError.badRequest('Already the owner');
  }

  // FORCE RLS: a plain db read found no binding, so every transfer was
  // refused as "Only the current owner". Read under the workspace.
  const current = await withTenant(opts.workspaceId, opts.fromUserId, (tx) =>
    tx.query.roleBindings.findFirst({
      where: and(
        eq(roleBindings.tenantId, opts.workspaceId),
        eq(roleBindings.userId, opts.fromUserId),
        eq(roleBindings.scopeType, 'organization'),
        eq(roleBindings.scopeId, opts.workspaceId),
        eq(roleBindings.role, 'owner'),
        isNull(roleBindings.revokedAt),
      ),
    }),
  );
  if (!current) {
    throw ApiError.forbidden('Only the current owner can transfer ownership');
  }

  await upsertRoleBinding({
    tenantId: opts.workspaceId,
    userId: opts.toUserId,
    scopeType: 'organization',
    scopeId: opts.workspaceId,
    role: 'owner',
    grantedBy: opts.fromUserId,
  });

  // Invariant: >= 1 owner at all times. New owner is bound before the old one is revoked.
  if ((await countActiveOwners(opts.workspaceId)) < 2) {
    throw ApiError.conflict('Ownership transfer would leave the workspace without an owner');
  }

  await revokeRoleBindingMatching({
    tenantId: opts.workspaceId,
    userId: opts.fromUserId,
    scopeType: 'organization',
    scopeId: opts.workspaceId,
    role: 'owner',
  });

  // Former owner keeps admin binding so they are not locked out.
  await upsertRoleBinding({
    tenantId: opts.workspaceId,
    userId: opts.fromUserId,
    scopeType: 'organization',
    scopeId: opts.workspaceId,
    role: 'admin',
    grantedBy: opts.fromUserId,
  });

  // Seat only: membership carries no authority (bindings above do).
  await ensureWorkspaceMembership({
    workspaceId: opts.workspaceId,
    userId: opts.toUserId,
  });

  clearBindingCache(opts.fromUserId, opts.workspaceId);
  clearBindingCache(opts.toUserId, opts.workspaceId);
}
