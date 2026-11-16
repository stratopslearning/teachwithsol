import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import {
  deleteModule,
  setModulePublished,
  updateModule,
} from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

type P = { courseId: string; moduleId: string };

const patchBody = z.object({
  title: z.string().optional(),
  position: z.number().optional(),
  published: z.boolean().optional(),
  unlockAt: z.string().nullable().optional(),
  prerequisiteModuleIds: z.array(z.string()).optional(),
});

export const PATCH = route<P, typeof patchBody>(
  { auth: 'manageCourse', body: patchBody },
  async ({ params, user, body }) => {
    const { courseId, moduleId } = params;
    if (typeof body.published !== 'boolean') {
      const mod = await updateModule(courseId, moduleId, body);
      return NextResponse.json({ module: mod });
    }
    const { published, title, position, unlockAt, prerequisiteModuleIds } = body;
    if (
      title !== undefined ||
      position !== undefined ||
      unlockAt !== undefined ||
      prerequisiteModuleIds !== undefined
    ) {
      await updateModule(courseId, moduleId, {
        title,
        position,
        unlockAt,
        prerequisiteModuleIds,
      });
    }
    return NextResponse.json(
      await setModulePublished(user, courseId, moduleId, published),
    );
  },
);

export const DELETE = route<P>({ auth: 'manageCourse' }, async ({ params }) =>
  NextResponse.json({ id: await deleteModule(params.courseId, params.moduleId) }),
);
