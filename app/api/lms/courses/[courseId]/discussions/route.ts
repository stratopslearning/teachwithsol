import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingApi } from '@/lib/api/sessionAuth';
import {
  listPeerDiscussionsDefiner,
  upsertPeerDiscussionDefiner,
} from '@/lib/db/lmsDefiners';
import { assertCanManageCourse } from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireTeachingApi();
    const { courseId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    return NextResponse.json({
      discussions: await listPeerDiscussionsDefiner(courseId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireTeachingApi();
    const { courseId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const discussion = await upsertPeerDiscussionDefiner({
      ...body,
      courseId,
      createdByUserId: user.id,
    });
    return NextResponse.json({ discussion });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
