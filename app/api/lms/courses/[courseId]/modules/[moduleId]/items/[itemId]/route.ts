import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { assertCanManageCourse } from '@/lib/knowledge';
import { deleteModuleItem, updateModuleItem } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  ctx: {
    params: Promise<{ courseId: string; moduleId: string; itemId: string }>;
  },
) {
  try {
    const user = await requireTeachingAccess();
    const { courseId, moduleId, itemId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const body = (await readJsonBody(req)) as {
      title?: string;
      position?: number;
      published?: boolean;
      completionRequirement?: {
        type: 'view' | 'submit' | 'score_at_least';
        minPercent?: number;
      } | null;
    };
    const item = await updateModuleItem(moduleId, itemId, body);
    return NextResponse.json({ item });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: {
    params: Promise<{ courseId: string; moduleId: string; itemId: string }>;
  },
) {
  try {
    const user = await requireTeachingAccess();
    const { courseId, moduleId, itemId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const id = await deleteModuleItem(moduleId, itemId);
    return NextResponse.json({ id });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
