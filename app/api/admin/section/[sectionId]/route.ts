import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

import { db } from '@/app/db';
import { sections, users } from '@/app/db/schema';
import { loadAdminRecord } from '@/lib/admin/records';
import { withTenant } from '@/lib/db/tenantContext';
import { apiErrorResponse } from '@/lib/api/errors';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { parseOptionalEndsAt } from '@/lib/sections/availability';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const updateSectionSchema = z.object({
  name: z.string().min(1, 'Section name is required').max(100, 'Section name too long'),
  endsAt: z.union([z.string(), z.null()]).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const { sectionId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
    });
    if (!user || !user.platformStaff) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 },
      );
    }
    // FORCE RLS: a plain db read finds no section; load it via the definer.
    const targetSection = await loadAdminRecord('section', sectionId);
    if (!targetSection) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }
    const tenantId = targetSection.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Section missing tenant' }, { status: 400 });
    }
    await requireSupportGrant(
      {
        id: user.id,
        clerkId: user.clerkId,
        platformStaff: user.platformStaff,
      },
      tenantId,
      { action: 'support.tenant_access', targetType: 'section', targetId: sectionId },
    );
    const body = await req.json();
    const validatedData = updateSectionSchema.parse(body);
    const patch: { name: string; endsAt?: Date | null; updatedAt: Date } = {
      name: validatedData.name,
      updatedAt: new Date(),
    };
    if ('endsAt' in body) {
      const endsAtResult = parseOptionalEndsAt(validatedData.endsAt ?? null);
      if (!endsAtResult.ok) {
        return NextResponse.json({ error: endsAtResult.error }, { status: 400 });
      }
      patch.endsAt = endsAtResult.endsAt;
    }
    // Under the section's tenant: a plain update matched no rows.
    const [updatedSection] = await withTenant(tenantId, user.id, (tx) =>
      tx.update(sections).set(patch).where(eq(sections.id, sectionId)).returning(),
    );
    return NextResponse.json({ success: true, section: updatedSection });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 },
      );
    }
    console.error('Error updating section:', error);
    return apiErrorResponse(error);
  }
}

export const DELETE = route<{ sectionId: string }>(
  { auth: 'staff' },
  async ({ req, params, user }) => {
    const { sectionId } = params;

    // FORCE RLS: a plain db read finds no section; load it via the definer.
    const targetSection = await loadAdminRecord('section', sectionId);
    if (!targetSection) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }
    const tenantId = targetSection.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Section missing tenant' }, { status: 400 });
    }
    await requireSupportGrant(
      {
        id: user.id,
        clerkId: user.clerkId,
        platformStaff: user.platformStaff,
      },
      tenantId,
      { action: 'support.tenant_access', targetType: 'section', targetId: sectionId },
    );
    if (targetSection.deletedAt) {
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }

    // Soft delete: keep the row + dependents so admins can audit/restore.
    // Hard delete with full cascade is at /api/admin/section/[id]/purge.
    await withTenant(tenantId, user.id, (tx) =>
      tx
        .update(sections)
        .set({ deletedAt: new Date(), isActive: false })
        .where(eq(sections.id, sectionId)),
    );

    const meta = extractRequestMeta(req);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'admin.section.delete',
      targetType: 'section',
      targetId: sectionId,
      metadata: { name: targetSection.label, soft: true },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ success: true });
  },
);
