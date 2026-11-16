import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import { completionRequirementSchema } from '@/lib/lms/schemas';
import { deleteModuleItem, updateModuleItem } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

type P = { courseId: string; moduleId: string; itemId: string };

const patchBody = z.object({
  title: z.string().optional(),
  position: z.number().optional(),
  published: z.boolean().optional(),
  completionRequirement: completionRequirementSchema.nullable().optional(),
});

export const PATCH = route<P, typeof patchBody>(
  { auth: 'manageCourse', body: patchBody },
  async ({ params, body }) =>
    NextResponse.json({
      item: await updateModuleItem(params.moduleId, params.itemId, body),
    }),
);

export const DELETE = route<P>({ auth: 'manageCourse' }, async ({ params }) =>
  NextResponse.json({ id: await deleteModuleItem(params.moduleId, params.itemId) }),
);
