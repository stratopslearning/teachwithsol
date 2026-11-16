import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/app/db';
import { users, workspaces } from '@/app/db/schema';
import { apiErrorResponse } from '@/lib/api/errors';
import { logAudit } from '@/lib/audit';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { withTenant } from '@/lib/db/tenantContext';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  parentWorkspaceId: z.string().uuid().nullable(),
});

async function requireAdminUser() {
  const { auth } = await import('@clerk/nextjs/server');
  const { userId } = await auth();
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });
  if (!user || !user.platformStaff) return null;
  return user;
}

/** Link a child workspace to an institution (parent workspace). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ workspaceId: string }> },
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { workspaceId } = await ctx.params;
    const body = bodySchema.parse(await readJsonBody(req));

    // FORCE RLS: a workspace row is visible under its own tenant only; a
    // plain db read found nothing (always "Workspace not found").
    const child = await withTenant(workspaceId, admin.id, (tx) =>
      tx.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) }),
    );
    if (!child) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    await requireSupportGrant(
      {
        id: admin.id,
        clerkId: admin.clerkId,
        platformStaff: admin.platformStaff,
      },
      workspaceId,
      {
        action: 'support.tenant_access',
        targetType: 'workspace',
        targetId: workspaceId,
      },
    );

    if (body.parentWorkspaceId) {
      if (body.parentWorkspaceId === workspaceId) {
        return NextResponse.json(
          { error: 'Workspace cannot be its own parent' },
          { status: 400 },
        );
      }
      const parentId = body.parentWorkspaceId;
      const parent = await withTenant(parentId, admin.id, (tx) =>
        tx.query.workspaces.findFirst({ where: eq(workspaces.id, parentId) }),
      );
      if (!parent) {
        return NextResponse.json(
          { error: 'Parent workspace not found' },
          { status: 404 },
        );
      }
    }

    const [updated] = await withTenant(workspaceId, admin.id, (tx) =>
      tx
        .update(workspaces)
        .set({
          parentWorkspaceId: body.parentWorkspaceId,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId))
        .returning(),
    );

    await logAudit({
      actorUserId: admin.id,
      actorClerkId: admin.clerkId,
      action: 'admin.workspace.link_parent',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: { parentWorkspaceId: body.parentWorkspaceId },
      tenantId: workspaceId,
    });

    return NextResponse.json({ workspace: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
