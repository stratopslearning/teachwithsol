import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import { createModule, listModulesWithItems } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

type P = { courseId: string };

export const GET = route<P>({ auth: 'manageCourse' }, async ({ params }) =>
  NextResponse.json({ modules: await listModulesWithItems(params.courseId) }),
);

const createBody = z.object({
  title: z.string().optional(),
  published: z.boolean().optional(),
});

export const POST = route<P, typeof createBody>(
  { auth: 'manageCourse', body: createBody },
  async ({ params, user, body }) => {
    const sectionIds = await listTeachableSectionIdsForCourse(user, params.courseId);
    const mod = await createModule({
      courseId: params.courseId,
      title: body.title?.trim() || 'New module',
      published: Boolean(body.published),
      sectionIds,
    });
    return NextResponse.json({ module: mod });
  },
);
