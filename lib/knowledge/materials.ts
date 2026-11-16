import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
} from 'drizzle-orm';

import { db } from '@/app/db';
import {
  bookChapters,
  courseKnowledgeLinks,
  courseMaterialChunks,
  courseMaterials,
  knowledgeDocuments,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { logAudit } from '@/lib/audit';
import type { AuthUser } from '@/lib/getOrCreateUser';
import {
  assertCanManageCourse,
  assertCanManageMaterial,
} from '@/lib/knowledge/access';
import { isS3Configured } from '@/lib/knowledge/storage';
import {
  ALLOWED_UPLOAD_MIME,
  MAX_UPLOAD_BYTES,
  MAX_ZIP_UPLOAD_BYTES,
} from '@/lib/knowledge/constants';
import {
  addWorkspaceDocumentFromUpload,
  addWorkspaceDocumentFromUrl,
  importWorkspaceDocumentsFromZip,
  type KnowledgeDocumentSummary,
} from '@/lib/knowledge/documents';
import { softDeleteMirroredKnowledgeDocs } from '@/lib/knowledge/mirror';
import type { ZipImportSkip } from '@/lib/knowledge/zipImport';
import { getCourseWorkspaceId } from '@/lib/workspace';

export type MaterialSummary = {
  id: string;
  courseId: string;
  title: string;
  sourceType: 'UPLOAD' | 'URL';
  mimeType: string | null;
  byteSize: number | null;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  errorMessage: string | null;
  externalUrl: string | null;
  authoringCorpus: 'prior_course' | 'this_term';
  createdAt: Date;
  updatedAt: Date;
};

function knowledgeDocToMaterialSummary(
  courseId: string,
  doc: KnowledgeDocumentSummary,
): MaterialSummary {
  return {
    id: doc.id,
    courseId,
    title: doc.title,
    sourceType: doc.sourceKind === 'URL' ? 'URL' : 'UPLOAD',
    mimeType: doc.mimeType,
    byteSize: doc.byteSize,
    status: doc.status,
    errorMessage: doc.errorMessage,
    externalUrl: doc.externalUrl,
    authoringCorpus: doc.authoringCorpus ?? 'this_term',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toSummary(
  row: typeof courseMaterials.$inferSelect,
): MaterialSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    sourceType: row.sourceType as 'UPLOAD' | 'URL',
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    status: row.status as MaterialSummary['status'],
    errorMessage: row.errorMessage,
    externalUrl: row.externalUrl,
    authoringCorpus:
      (row.authoringCorpus as MaterialSummary['authoringCorpus']) ??
      'this_term',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCourseMaterials(
  user: AuthUser,
  courseId: string,
): Promise<MaterialSummary[]> {
  await assertCanManageCourse(user, courseId);

  // FORCE RLS: bare course_materials / book / knowledge reads return 0 rows.
  const { fetchCourseMaterialsList } = await import(
    '@/lib/db/entityScopedReads'
  );
  return fetchCourseMaterialsList(courseId);
}

export async function getCourseMaterial(
  user: AuthUser,
  materialId: string,
): Promise<MaterialSummary> {
  const material = await assertCanManageMaterial(user, materialId);
  return toSummary(material);
}

export async function addMaterialFromUrl(
  user: AuthUser,
  opts: { courseId: string; url: string; title?: string },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<MaterialSummary> {
  await assertCanManageCourse(user, opts.courseId);
  let parsed: URL;
  try {
    const { assertSafeMaterialUrl } = await import('@/lib/knowledge/urlSafety');
    parsed = assertSafeMaterialUrl(opts.url);
  } catch (e) {
    throw ApiError.badRequest(
      e instanceof Error ? e.message : 'Invalid URL',
    );
  }

  const title =
    opts.title?.trim() ||
    parsed.pathname.split('/').filter(Boolean).pop() ||
    parsed.hostname;

  const workspaceId = await getCourseWorkspaceId(opts.courseId);
  if (!workspaceId) {
    throw ApiError.badRequest('Course has no workspace for knowledge library');
  }

  const doc = await addWorkspaceDocumentFromUrl(user, {
    workspaceId,
    url: parsed.toString(),
    title,
    courseId: opts.courseId,
    visibility: 'workspace',
  });

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'professor.material.create',
    targetType: 'knowledge_document',
    targetId: doc.id,
    metadata: { courseId: opts.courseId, sourceType: 'URL', library: true },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  return knowledgeDocToMaterialSummary(opts.courseId, doc);
}

export async function addMaterialFromUpload(
  user: AuthUser,
  opts: {
    courseId: string;
    title?: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<MaterialSummary> {
  await assertCanManageCourse(user, opts.courseId);
  if (!isS3Configured()) {
    throw ApiError.badRequest(
      'File uploads require AWS_S3_BUCKET and AWS_REGION to be configured.',
    );
  }
  if (opts.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw ApiError.badRequest('File exceeds 50 MB limit');
  }
  const mime = opts.mimeType || 'application/octet-stream';
  const lowerName = opts.fileName.toLowerCase();
  const allowedByExt =
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown');
  if (!ALLOWED_UPLOAD_MIME.has(mime) && !allowedByExt) {
    throw ApiError.badRequest(
      'Unsupported file type. Use PDF, DOCX, TXT, or Markdown.',
    );
  }

  const title =
    opts.title?.trim() ||
    opts.fileName.replace(/\.[^.]+$/, '') ||
    'Untitled material';

  const workspaceId = await getCourseWorkspaceId(opts.courseId);
  if (!workspaceId) {
    throw ApiError.badRequest('Course has no workspace for knowledge library');
  }

  const doc = await addWorkspaceDocumentFromUpload(user, {
    workspaceId,
    title,
    fileName: opts.fileName,
    mimeType: mime,
    buffer: opts.buffer,
    courseId: opts.courseId,
    visibility: 'workspace',
  });

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'professor.material.create',
    targetType: 'knowledge_document',
    targetId: doc.id,
    metadata: {
      courseId: opts.courseId,
      sourceType: 'UPLOAD',
      byteSize: opts.buffer.byteLength,
      library: true,
    },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  return knowledgeDocToMaterialSummary(opts.courseId, doc);
}

export type CourseMaterialsZipImportResult = {
  materials: MaterialSummary[];
  imported: number;
  skipped: ZipImportSkip[];
};

/**
 * Unpack a zip into course materials (one per supported file).
 * Folder paths become title prefixes for authoring organization.
 */
export async function importCourseMaterialsFromZip(
  user: AuthUser,
  opts: { courseId: string; fileName: string; buffer: Buffer },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<CourseMaterialsZipImportResult> {
  await assertCanManageCourse(user, opts.courseId);
  if (!isS3Configured()) {
    throw ApiError.badRequest(
      'File uploads require AWS_S3_BUCKET and AWS_REGION to be configured.',
    );
  }
  if (opts.buffer.byteLength > MAX_ZIP_UPLOAD_BYTES) {
    throw ApiError.badRequest('Zip exceeds 50 MB limit');
  }

  const workspaceId = await getCourseWorkspaceId(opts.courseId);
  if (!workspaceId) {
    throw ApiError.badRequest('Course has no workspace for knowledge library');
  }

  const result = await importWorkspaceDocumentsFromZip(user, {
    workspaceId,
    fileName: opts.fileName,
    buffer: opts.buffer,
    courseId: opts.courseId,
  });

  if (result.imported === 0) {
    const s3Fails = result.skipped.filter((s) =>
      /s3|storage is not configured|credentials/i.test(s.reason),
    );
    if (s3Fails.length > 0) {
      throw ApiError.badRequest(
        'Could not store files in S3. Check AWS credentials (aws login) and try again.',
        { skipped: result.skipped },
      );
    }
    const reasons = [...new Set(result.skipped.map((s) => s.reason))].slice(
      0,
      3,
    );
    throw ApiError.badRequest(
      reasons.length > 0
        ? `Nothing imported: ${reasons.join('; ')}`
        : 'Zip had no files that could be imported into the knowledge library',
      { skipped: result.skipped },
    );
  }

  return {
    materials: result.documents.map((d) =>
      knowledgeDocToMaterialSummary(opts.courseId, d),
    ),
    imported: result.imported,
    skipped: result.skipped,
  };
}

export async function softDeleteMaterial(
  user: AuthUser,
  materialId: string,
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  await softDeleteMaterials(user, { materialIds: [materialId] }, audit);
}

export async function softDeleteMaterials(
  user: AuthUser,
  opts: { courseId?: string; materialIds: string[] },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<{ deleted: number }> {
  const uniqueIds = [...new Set(opts.materialIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw ApiError.badRequest('No materials selected');
  }
  if (uniqueIds.length > 500) {
    throw ApiError.badRequest('Too many materials selected (max 500)');
  }

  if (opts.courseId) {
    await assertCanManageCourse(user, opts.courseId);
  }

  const { fetchCourseMaterialByIdDefiner, softDeleteCourseMaterialsDefiner } =
    await import('@/lib/db/knowledgeJobDefiners');

  const rows = (
    await Promise.all(uniqueIds.map((id) => fetchCourseMaterialByIdDefiner(id)))
  ).filter(
    (row): row is NonNullable<typeof row> =>
      row != null &&
      row.deletedAt == null &&
      (!opts.courseId || row.courseId === opts.courseId),
  );
  if (rows.length === 0) throw ApiError.notFound('Material not found');

  // When courseId is omitted (single-id path), authorize each course once.
  if (!opts.courseId) {
    const courseIds = [...new Set(rows.map((r) => r.courseId))];
    for (const courseId of courseIds) {
      await assertCanManageCourse(user, courseId);
    }
  }

  const ids = rows.map((r) => r.id);
  await softDeleteCourseMaterialsDefiner(ids);
  await softDeleteMirroredKnowledgeDocs(ids);

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'professor.materials.soft_delete',
    targetType: 'course_material',
    targetId: ids[0]!,
    metadata: {
      courseId: opts.courseId ?? rows[0]!.courseId,
      materialIds: ids,
      deleted: ids.length,
    },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  return { deleted: ids.length };
}

export async function setMaterialAuthoringCorpus(
  user: AuthUser,
  materialId: string,
  corpus: 'prior_course' | 'this_term',
): Promise<MaterialSummary> {
  await assertCanManageMaterial(user, materialId);
  const { setCourseMaterialAuthoringCorpusDefiner, fetchCourseMaterialByIdDefiner } =
    await import('@/lib/db/knowledgeJobDefiners');
  const updated = await setCourseMaterialAuthoringCorpusDefiner(
    materialId,
    corpus,
  );
  if (!updated) throw ApiError.notFound('Material not found');
  const row = await fetchCourseMaterialByIdDefiner(materialId);
  if (!row) throw ApiError.notFound('Material not found');
  return toSummary(row as unknown as typeof courseMaterials.$inferSelect);
}
