import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiError } from '@/lib/api/errors';
import { route } from '@/lib/api/route';
import { listOutlinesForCourse } from '@/lib/authoring/outlines';
import { backfillModulesFromOutline } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

const body = z.object({ outlineId: z.string().optional() });

export const POST = route<{ courseId: string }, typeof body>(
  { auth: 'manageCourse', body },
  async ({ params, user, body }) => {
    const outlineId =
      body.outlineId ??
      (await listOutlinesForCourse(user, params.courseId))[0]?.id;
    if (!outlineId) throw ApiError.badRequest('No outline found for this course');
    const result = await backfillModulesFromOutline(outlineId);
    return NextResponse.json({ result });
  },
);
