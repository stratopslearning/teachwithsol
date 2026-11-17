import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { withCourseTenant } from '@/lib/db/sectionTenants';
import { courses } from '@/app/db/schema';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { parseAiPolicy } from '@/lib/chatbot/aiPolicy';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  aiPolicy: z
    .object({
      mode: z.enum(['hints', 'guided', 'full_after_submit']),
    })
    .nullable()
    .optional(),
  subject: z.string().min(1).max(120).optional(),
  level: z.string().min(1).max(80).optional(),
  feedbackTone: z.string().min(1).max(80).optional(),
});

export const GET = route<{ courseId: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { courseId } = params;
    await assertCanManageCourse(auth.user, courseId);

    // FORCE RLS: plain db reads/updates see no rows; run under the course's tenant.
    const course = await withCourseTenant(courseId, auth.user.id, (tx) =>
      tx.query.courses.findFirst({
        where: eq(courses.id, courseId),
        columns: {
          id: true,
          title: true,
          subject: true,
          level: true,
          feedbackTone: true,
          aiPolicy: true,
        },
      }),
    );
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    return NextResponse.json({ course });
  },
);

export const PATCH = route<{ courseId: string }>(
  { auth: { professorApi: 'authoring:write' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const { courseId } = params;
    await assertCanManageCourse(auth.user, courseId);
    const body = patchSchema.parse(await readJsonBody(req));

    const patch: {
      aiPolicy?: ReturnType<typeof parseAiPolicy>;
      subject?: string;
      level?: string;
      feedbackTone?: string;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.aiPolicy !== undefined) {
      const parsed = body.aiPolicy ? parseAiPolicy(body.aiPolicy) : null;
      if (body.aiPolicy && !parsed) {
        return NextResponse.json({ error: 'Invalid aiPolicy' }, { status: 400 });
      }
      patch.aiPolicy = parsed;
    }
    if (body.subject !== undefined) patch.subject = body.subject.trim();
    if (body.level !== undefined) patch.level = body.level.trim();
    if (body.feedbackTone !== undefined) {
      patch.feedbackTone = body.feedbackTone.trim();
    }

    if (
      body.aiPolicy === undefined &&
      body.subject === undefined &&
      body.level === undefined &&
      body.feedbackTone === undefined
    ) {
      return NextResponse.json({ ok: true });
    }

    // (A plain db update matched no rows, so settings were silently not saved.)
    const rows = await withCourseTenant(courseId, auth.user.id, (tx) =>
      tx
        .update(courses)
        .set(patch)
        .where(eq(courses.id, courseId))
        .returning({
          id: courses.id,
          aiPolicy: courses.aiPolicy,
          subject: courses.subject,
          level: courses.level,
          feedbackTone: courses.feedbackTone,
        }),
    );
    const updated = rows?.[0];
    if (!updated) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, course: updated });
  },
);
