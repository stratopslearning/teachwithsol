import { NextResponse } from 'next/server';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';

import { withCourseTenant } from '@/lib/db/sectionTenants';
import { courseOutlines } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import { withBasePath } from '@/lib/basePath';
import { getCourseWorkspaceId } from '@/lib/workspace';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  suggestionId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
});

export const POST = route<{ courseId: string }>(
  { auth: { professorApi: 'authoring:write' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const { courseId } = params;
    await assertCanManageCourse(auth.user, courseId);
    const contentType = req.headers.get('content-type') ?? '';
    let raw: unknown;
    if (contentType.includes('application/json')) {
      raw = await readJsonBody(req);
    } else {
      const form = await req.formData();
      raw = {
        suggestionId: form.get('suggestionId'),
        title: form.get('title'),
        description: form.get('description'),
      };
    }
    const body = bodySchema.parse(raw);

    // FORCE RLS: a plain db read finds no outline (always "no_outline").
    const outline = await withCourseTenant(courseId, auth.user.id, (tx) =>
      tx.query.courseOutlines.findFirst({
        where: and(
          eq(courseOutlines.courseId, courseId),
          isNull(courseOutlines.deletedAt),
          ne(courseOutlines.status, 'ARCHIVED'),
        ),
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      }),
    );

    if (!outline) {
      return NextResponse.json(
        { ok: false, reason: 'no_outline', message: 'No active outline to attach revision.' },
        { status: 200 },
      );
    }

    const tenantId = await getCourseWorkspaceId(courseId);
    if (!tenantId) {
      throw ApiError.notFound('Course workspace not found');
    }
    const { insertAuthoringRevisionDefiner } = await import(
      '@/lib/db/entityScopedReads'
    );
    const snapshot = {
      source: 'analytics_insights',
      suggestionId: body.suggestionId,
      title: body.title,
      description: body.description ?? null,
      acceptedAt: new Date().toISOString(),
    };
    const label = `Insight: ${body.title.slice(0, 120)}`;
    const revisionId = await insertAuthoringRevisionDefiner({
      outlineId: outline.id,
      tenantId,
      userId: auth.user.id,
      label,
      snapshot,
    });
    const revision = {
      id: revisionId,
      outlineId: outline.id,
      tenantId,
      createdByUserId: auth.user.id,
      label,
      snapshot,
    };

    if (contentType.includes('application/json')) {
      return NextResponse.json({
        ok: true,
        revision,
        authoringUrl: `/dashboard/professor/authoring/${courseId}?refineRevision=${revisionId}`,
      });
    }
    // NOTE: next/navigation redirect() throws NEXT_REDIRECT, which the catch
    // below would turn into an error response. Return a 303 instead.
    return NextResponse.redirect(
      new URL(
        withBasePath(
          `/dashboard/professor/authoring/${courseId}?refineRevision=${revisionId}`,
        ),
        req.url,
      ),
      303,
    );
  },
);
