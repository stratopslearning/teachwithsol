import { and, eq, isNull } from 'drizzle-orm';

import { outlineModules } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import {
  fetchOutlineById,
  fetchOutlineItemById,
  fetchOutlineTreeById,
} from '@/lib/db/entityScopedReads';
import {
  resolveCourseTenantId,
  withOutlineTenant,
} from '@/lib/authoring/tenant';
import { assertCanManageCourse } from '@/lib/knowledge/access';

export async function assertCanManageOutline(
  user: AuthUser,
  outlineId: string,
) {
  // FORCE RLS: bare course_outlines reads return 0 without tenant GUC.
  const outline = await fetchOutlineById(outlineId);
  if (!outline) throw ApiError.notFound('Outline not found');
  await assertCanManageCourse(user, outline.courseId);
  return outline;
}

/**
 * Resolve an outline item for authoring writes.
 * Prefer DEFINER tree reads — withOutlineTenant/Neon WS can hang under load.
 */
export async function assertCanManageItem(user: AuthUser, itemId: string) {
  const resolved = await fetchOutlineItemById(itemId);
  if (!resolved || resolved.deletedAt) {
    throw ApiError.notFound('Outline item not found');
  }
  await assertCanManageCourse(user, resolved.courseId);

  const tree = await fetchOutlineTreeById(resolved.outlineId);
  if (!tree) throw ApiError.notFound('Outline item not found');

  const mod = tree.modules.find((m) => m.items.some((i) => i.id === itemId));
  const leaf = mod?.items.find((i) => i.id === itemId);
  if (!mod || !leaf) throw ApiError.notFound('Outline item not found');

  const outlineRow = await fetchOutlineById(resolved.outlineId);
  if (!outlineRow) throw ApiError.notFound('Outline not found');
  const tenantId =
    outlineRow.tenantId ??
    resolved.tenantId ??
    (await resolveCourseTenantId(resolved.courseId));

  return {
    item: {
      id: leaf.id,
      moduleId: leaf.moduleId,
      type: leaf.type,
      title: leaf.title,
      status: leaf.status,
      body: leaf.body ?? {},
      sourceMaterialIds: leaf.sourceMaterialIds ?? [],
      variantOfItemId: leaf.variantOfItemId ?? null,
      faithfulBody: leaf.faithfulBody ?? null,
      publishedQuizId: leaf.publishedQuizId ?? null,
      publishedChatbotId: leaf.publishedChatbotId ?? null,
      publishedLessonId: leaf.publishedLessonId ?? null,
      publishedInteractiveId: leaf.publishedInteractiveId ?? null,
      position: leaf.position,
      deletedAt: null,
    },
    module: {
      id: mod.id,
      outlineId: tree.id,
      title: mod.title,
      summary: mod.summary,
      position: mod.position,
      deletedAt: null,
      outline: {
        id: tree.id,
        courseId: tree.courseId,
        tenantId,
        title: tree.title,
        status: tree.status,
        deletedAt: null,
      },
    },
    outline: {
      id: tree.id,
      courseId: tree.courseId,
      tenantId,
      title: tree.title,
      status: tree.status,
      deletedAt: null,
    },
  };
}

/**
 * Active section ids of a course the user may read rosters/analytics for
 * (`roster.read` via role bindings; platform staff only with a support grant).
 * professor_sections is metadata and confers nothing.
 *
 * FORCE RLS: bare `sections` reads inside withCourseTenant often return [] when
 * the Neon pool drops the tenant GUC — use DEFINER course→section resolve.
 */
export async function listTeachableSectionIdsForCourse(
  user: AuthUser,
  courseId: string,
): Promise<string[]> {
  await assertCanManageCourse(user, courseId);

  const { fetchSectionRowsForCourse } = await import(
    '@/lib/db/entityScopedReads'
  );
  const rows = await fetchSectionRowsForCourse(courseId);
  const allowed: string[] = [];
  for (const r of rows) {
    if (await authorizeOnSection(user, 'roster.read', r.id)) allowed.push(r.id);
  }
  return allowed;
}

export async function getModuleForOutline(
  outlineId: string,
  moduleId: string,
  userId?: string | null,
) {
  return withOutlineTenant(outlineId, userId ?? null, async (tx) => {
    const mod = await tx.query.outlineModules.findFirst({
      where: and(
        eq(outlineModules.id, moduleId),
        eq(outlineModules.outlineId, outlineId),
        isNull(outlineModules.deletedAt),
      ),
    });
    if (!mod) throw ApiError.notFound('Module not found');
    return mod;
  });
}
