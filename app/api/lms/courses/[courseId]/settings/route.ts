import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import { updateCourseLmsSettingsDefiner } from '@/lib/db/lmsDefiners';
import { normalizeCourseNav } from '@/lib/lms/courseNav';

export const dynamic = 'force-dynamic';

const patchBody = z.object({
  // Shape-checked by normalizeCourseNav.
  navigation: z.unknown().optional(),
  syllabusMarkdown: z.string().nullable().optional(),
});

export const PATCH = route<{ courseId: string }, typeof patchBody>(
  { auth: 'manageCourse', body: patchBody },
  async ({ params, body }) => {
    const updated = await updateCourseLmsSettingsDefiner({
      courseId: params.courseId,
      navigation:
        body.navigation !== undefined ? normalizeCourseNav(body.navigation) : undefined,
      syllabusMarkdown: body.syllabusMarkdown,
    });
    return NextResponse.json(updated);
  },
);
