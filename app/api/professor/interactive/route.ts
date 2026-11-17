import { NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';
import { createInteractive } from '@/lib/interactives';
import type { InteractiveKind } from '@/app/db/schema';
import { route } from '@/lib/api/route';

export const POST = route(
  { auth: { professorApi: null } },
  async ({ req, user }) => {
    const body = await req.json();
    const kind = body.kind as InteractiveKind;
    if (!kind || !body.courseId || !body.title) {
      throw ApiError.badRequest('courseId, title, and kind are required');
    }
    const created = await createInteractive(user, {
      courseId: body.courseId,
      title: body.title,
      description: body.description,
      kind,
      body: body.body ?? {},
      sectionIds: body.sectionIds,
      isActive: body.isActive ?? false,
    });
    return NextResponse.json({ interactive: created });
  },
);
