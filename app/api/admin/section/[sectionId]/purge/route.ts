/**
 * Hard delete (purge) of a section. FK CASCADE wipes attempts, quiz_sections,
 * professor_sections, and student_sections automatically.
 */
import { NextResponse } from 'next/server';

import { extractRequestMeta, logAudit } from '@/lib/audit';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { adminFetchSectionDefiner, adminPurgeSectionDefiner } from '@/lib/db/tenantWriteDefiners';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const DELETE = route<{ sectionId: string }>(
  { auth: 'staff' },
  async ({ req: request, params, user }) => {
    const { sectionId } = params;

    const targetSection = await adminFetchSectionDefiner(sectionId);
    if (!targetSection) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }
    const tenantId =
      (targetSection.tenant_id as string | null) ??
      (targetSection.workspace_id as string | null);
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

    await adminPurgeSectionDefiner(sectionId);

    const meta = extractRequestMeta(request);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'admin.section.purge',
      targetType: 'section',
      targetId: sectionId,
      metadata: { name: targetSection.name, hard: true },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ success: true });
  },
);
