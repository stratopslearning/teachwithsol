import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import {
  createCourseAnnouncementDefiner,
  listCourseAnnouncementsDefiner,
} from '@/lib/db/lmsDefiners';

export const dynamic = 'force-dynamic';

type P = { courseId: string };

export const GET = route<P>({ auth: 'manageCourse' }, async ({ params }) =>
  NextResponse.json({
    announcements: await listCourseAnnouncementsDefiner(params.courseId),
  }),
);

const createBody = z.object({
  title: z.string().optional(),
  bodyMarkdown: z.string().optional(),
  publish: z.boolean().optional(),
});

export const POST = route<P, typeof createBody>(
  { auth: 'manageCourse', body: createBody },
  async ({ params, user, body }) => {
    const announcement = await createCourseAnnouncementDefiner({
      courseId: params.courseId,
      authorUserId: user.id,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown,
      publish: body.publish ?? true,
    });
    return NextResponse.json({ announcement });
  },
);
