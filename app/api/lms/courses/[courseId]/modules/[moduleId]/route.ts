import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { assertCanManageCourse } from '@/lib/knowledge';
import { deleteModule, updateModule } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ courseId: string; moduleId: string }> },
) {
  try {
    const user = await requireTeachingAccess();
    const { courseId, moduleId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const body = (await readJsonBody(req)) as {
      title?: string;
      position?: number;
      published?: boolean;
      unlockAt?: string | null;
      prerequisiteModuleIds?: string[];
    };
    const mod = await updateModule(courseId, moduleId, body);
    return NextResponse.json({ module: mod });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ courseId: string; moduleId: string }> },
) {
  try {
    const user = await requireTeachingAccess();
    const { courseId, moduleId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const id = await deleteModule(courseId, moduleId);
    return NextResponse.json({ id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
