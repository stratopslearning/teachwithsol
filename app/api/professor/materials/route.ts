import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import {
  addMaterialFromUpload,
  addMaterialFromUrl,
  importCourseMaterialsFromZip,
  isKnowledgeZipUpload,
  listCourseMaterials,
  listTeachableCourses,
} from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const urlBodySchema = z.object({
  courseId: z.string().uuid(),
  url: z.string().url(),
  title: z.string().min(1).max(200).optional(),
});

/** List materials for a course, or teachable courses when courseId omitted. */
export const GET = route(
  { auth: { professorApi: 'read' } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const courseId = req.nextUrl.searchParams.get('courseId');
    if (!courseId) {
      const courses = await listTeachableCourses(auth.user);
      return NextResponse.json({ courses });
    }

    const materials = await listCourseMaterials(auth.user, courseId);
    return NextResponse.json({ materials });
  },
);

/** Create material from JSON URL body or multipart file upload (incl. zip pack). */
export const POST = route(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-materials-write:${auth.user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const meta = extractRequestMeta(req);
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const courseId = String(form.get('courseId') ?? '');
      const title = form.get('title') ? String(form.get('title')) : undefined;
      const file = form.get('file');
      if (!courseId || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'courseId and file are required' },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name || 'upload.bin';
      const mimeType = file.type || 'application/octet-stream';

      if (isKnowledgeZipUpload(fileName, mimeType)) {
        const result = await importCourseMaterialsFromZip(
          auth.user,
          { courseId, fileName, buffer },
          meta,
        );
        return NextResponse.json(
          {
            zip: true,
            materials: result.materials,
            imported: result.imported,
            skipped: result.skipped,
          },
          { status: 201 },
        );
      }

      const material = await addMaterialFromUpload(
        auth.user,
        {
          courseId,
          title,
          fileName,
          mimeType,
          buffer,
        },
        meta,
      );
      return NextResponse.json({ material }, { status: 201 });
    }

    const json = urlBodySchema.parse(await req.json());
    const material = await addMaterialFromUrl(
      auth.user,
      {
        courseId: json.courseId,
        url: json.url,
        title: json.title,
      },
      meta,
    );
    return NextResponse.json({ material }, { status: 201 });
  },
);
