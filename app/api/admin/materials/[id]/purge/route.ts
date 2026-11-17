/**
 * Hard delete (purge) of a course material: chunks + S3 object + row.
 */
import { NextResponse } from 'next/server';

import { extractRequestMeta, logAudit } from '@/lib/audit';
import { requireSupportGrant } from '@/lib/authz/requireSupportGrant';
import { purgeMaterial } from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const DELETE = route<{ id: string }>(
  { auth: 'staff' },
  async ({ req: request, params, user }) => {
    const { id } = params;

    const { fetchCourseMaterialByIdDefiner } = await import(
      '@/lib/db/knowledgeJobDefiners'
    );
    const material = await fetchCourseMaterialByIdDefiner(id);
    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    const tenantId = material.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Material missing tenant' }, { status: 400 });
    }
    await requireSupportGrant(
      {
        id: user.id,
        clerkId: user.clerkId,
        platformStaff: user.platformStaff,
      },
      tenantId,
      { action: 'support.tenant_access', targetType: 'course_material', targetId: id },
    );

    const purged = await purgeMaterial(id);
    const meta = extractRequestMeta(request);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'admin.material.purge',
      targetType: 'course_material',
      targetId: id,
      metadata: {
        title: purged.title,
        courseId: purged.courseId,
        s3Key: purged.s3Key,
        hard: true,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return NextResponse.json({ success: true });
  },
);
