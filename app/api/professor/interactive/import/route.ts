import { NextResponse } from 'next/server';

import { fetchCourseById } from '@/lib/db/entityScopedReads';
import { ApiError, apiErrorResponse } from '@/lib/api/errors';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { MAX_UPLOAD_BYTES } from '@/lib/knowledge/constants';
import { isS3Configured } from '@/lib/knowledge/storage';
import {
  buildInteractivePackageKey,
  putInteractivePackage,
} from '@/lib/interactives/storage';
import {
  createInteractive,
  setInteractivePackageStorageKey,
} from '@/lib/interactives';

export async function POST(req: Request) {
  try {
    const { user } = await requireProfessorApi(req);
    if (!isS3Configured()) {
      throw ApiError.badRequest('File storage is not configured');
    }

    const limited = await enforceRateLimit({
      key: `interactive-import:${user.id}`,
      limit: 20,
      windowMs: 60 * 60_000,
      message: 'Too many H5P imports. Try again later.',
    });
    if (limited) return limited;

    const form = await req.formData();
    const file = form.get('file');
    const courseId = String(form.get('courseId') ?? '');
    const title = String(form.get('title') ?? '').trim();
    const sectionIdsRaw = String(form.get('sectionIds') ?? '');
    const sectionIds = sectionIdsRaw
      ? sectionIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    if (!(file instanceof File)) {
      throw ApiError.badRequest('file is required');
    }
    if (!courseId || !title) {
      throw ApiError.badRequest('courseId and title are required');
    }
    if (!file.name.toLowerCase().endsWith('.h5p')) {
      throw ApiError.badRequest('Upload a .h5p package');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw ApiError.badRequest('File exceeds 50 MB limit');
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.byteLength > MAX_UPLOAD_BYTES) {
      throw ApiError.badRequest('File exceeds 50 MB limit');
    }

    // Create row first to get id for storage key
    const created = await createInteractive(user, {
      courseId,
      title,
      kind: 'H5P_PACKAGE',
      body: {
        packageFileName: file.name,
        packageContentType: file.type || 'application/zip',
      },
      sectionIds,
      isActive: false,
    });

    // FORCE RLS: a plain db read finds no course (tenantId was always null).
    const course = await fetchCourseById(courseId);
    const tenantId = course?.tenantId ?? course?.workspaceId ?? null;
    const key = buildInteractivePackageKey(
      courseId,
      created.id,
      file.name,
      tenantId,
    );
    await putInteractivePackage({
      key,
      body: buf,
      contentType: file.type || 'application/zip',
    });

    const updated = await setInteractivePackageStorageKey(user, created.id, key, {
      packageFileName: file.name,
      packageContentType: file.type || 'application/zip',
    });

    return NextResponse.json({ interactive: updated });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
