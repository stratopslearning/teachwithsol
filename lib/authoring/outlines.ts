import { and, desc, eq, isNull, ne } from 'drizzle-orm';

import {
  authoringRevisions,
  courseOutlines,
  outlineItems,
  type OutlineItemBody,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import {
  assertCanManageItem,
  assertCanManageOutline,
} from '@/lib/authoring/access';
import {
  isHollowQuizBody,
  restoreQuizContentFromFallback,
} from '@/lib/authoring/bodyMerge';
import {
  fetchAuthoringMessagesForOutline,
  fetchCourseById,
  fetchOutlineTreeById,
  fetchOutlinesForCourse,
  persistCourseOutlineDefiner,
} from '@/lib/db/entityScopedReads';
import { replanOutlineQuizSchedules } from '@/lib/authoring/schedule';
import {
  withItemTenant,
  withOutlineTenant,
} from '@/lib/authoring/tenant';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { AuthUser } from '@/lib/getOrCreateUser';
import type { OutlineSnapshot } from '@/lib/authoring/revisions';

export type AuthoringSessionSummary = {
  id: string;
  title: string;
  status: string;
  brief: string | null;
  preview: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OutlineItemSummary = {
  id: string;
  moduleId: string;
  type: 'LESSON' | 'QUIZ' | 'DISCUSSION' | 'INTERACTIVE';
  title: string;
  status: 'DRAFT' | 'PREVIEW' | 'PUBLISHED';
  body: OutlineItemBody;
  sourceMaterialIds: string[];
  reviewFlags?: import('@/app/db/schema').AuthoringReviewFlag[];
  reviewStatus?: string;
  aiMeta?: Record<string, unknown>;
  variantOfItemId: string | null;
  faithfulBody: OutlineItemBody | null;
  publishedQuizId: string | null;
  publishedChatbotId: string | null;
  publishedLessonId: string | null;
  publishedInteractiveId: string | null;
  position: number;
};

export type OutlineModuleSummary = {
  id: string;
  title: string;
  summary: string | null;
  position: number;
  items: OutlineItemSummary[];
};

export type OutlineDetail = {
  id: string;
  courseId: string;
  title: string;
  status: 'DRAFT' | 'READY' | 'ARCHIVED';
  brief: string | null;
  hasPriorCorpus: boolean;
  bodiesBuilt: boolean;
  createdAt: Date;
  updatedAt: Date;
  modules: OutlineModuleSummary[];
};

function mapItem(
  row: typeof outlineItems.$inferSelect,
): OutlineItemSummary {
  return {
    id: row.id,
    moduleId: row.moduleId,
    type: row.type as OutlineItemSummary['type'],
    title: row.title,
    status: row.status as OutlineItemSummary['status'],
    body: (row.body ?? {}) as OutlineItemBody,
    sourceMaterialIds: (row.sourceMaterialIds ?? []) as string[],
    reviewFlags: (row.reviewFlags ?? []) as OutlineItemSummary['reviewFlags'],
    reviewStatus: row.reviewStatus ?? 'none',
    aiMeta: (row.aiMeta ?? {}) as Record<string, unknown>,
    variantOfItemId: row.variantOfItemId ?? null,
    faithfulBody: (row.faithfulBody ?? null) as OutlineItemBody | null,
    publishedQuizId: row.publishedQuizId,
    publishedChatbotId: row.publishedChatbotId,
    publishedLessonId: row.publishedLessonId,
    publishedInteractiveId: row.publishedInteractiveId,
    position: row.position,
  };
}

function mapTreeToDetail(
  tree: NonNullable<Awaited<ReturnType<typeof fetchOutlineTreeById>>>,
): OutlineDetail {
  return {
    id: tree.id,
    courseId: tree.courseId,
    title: tree.title,
    status: tree.status as OutlineDetail['status'],
    brief: tree.brief,
    hasPriorCorpus: Boolean(tree.hasPriorCorpus),
    bodiesBuilt: Boolean(tree.bodiesBuilt),
    createdAt:
      tree.createdAt instanceof Date
        ? tree.createdAt
        : new Date(tree.createdAt),
    updatedAt:
      tree.updatedAt instanceof Date
        ? tree.updatedAt
        : new Date(tree.updatedAt),
    modules: [...(tree.modules ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        title: m.title,
        summary: m.summary,
        position: m.position,
        items: [...(m.items ?? [])]
          .sort((a, b) => a.position - b.position)
          .map(
            (item): OutlineItemSummary => ({
              id: item.id,
              moduleId: item.moduleId,
              type: item.type as OutlineItemSummary['type'],
              title: item.title,
              status: item.status as OutlineItemSummary['status'],
              body: (item.body ?? {}) as OutlineItemBody,
              sourceMaterialIds: (item.sourceMaterialIds ?? []) as string[],
              reviewFlags: (item.reviewFlags ??
                []) as OutlineItemSummary['reviewFlags'],
              reviewStatus: item.reviewStatus ?? 'none',
              aiMeta: {},
              variantOfItemId: item.variantOfItemId ?? null,
              faithfulBody: (item.faithfulBody ??
                null) as OutlineItemBody | null,
              publishedQuizId: item.publishedQuizId ?? null,
              publishedChatbotId: item.publishedChatbotId ?? null,
              publishedLessonId: item.publishedLessonId ?? null,
              publishedInteractiveId: item.publishedInteractiveId ?? null,
              position: item.position,
            }),
          ),
      })),
  };
}

export async function listOutlinesForCourse(
  user: AuthUser,
  courseId: string,
  opts?: { includeArchived?: boolean },
): Promise<AuthoringSessionSummary[]> {
  await assertCanManageCourse(user, courseId);
  // FORCE RLS: withTenant list can return 0 under Neon pool flakes — DEFINER.
  const rows = await fetchOutlinesForCourse(courseId, {
    includeArchived: opts?.includeArchived,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    brief: r.brief ?? null,
    preview: r.preview ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getCurrentOutlineForCourse(
  user: AuthUser,
  courseId: string,
): Promise<OutlineDetail | null> {
  await assertCanManageCourse(user, courseId);
  const rows = await fetchOutlinesForCourse(courseId, {
    includeArchived: false,
  });
  const current = rows[0];
  if (!current) return null;
  return getOutlineDetail(user, current.id);
}

export async function getOutlineDetail(
  user: AuthUser,
  outlineId: string,
): Promise<OutlineDetail> {
  await assertCanManageOutline(user, outlineId);
  const tree = await fetchOutlineTreeById(outlineId);
  if (!tree) throw ApiError.notFound('Outline not found');
  const detail = mapTreeToDetail(tree);
  const withStems = await healHollowQuizBodiesFromRevisions(detail);
  return replanPastQuizSchedules(withStems);
}

/**
 * If a refine patch wiped quiz stems but left points, restore stems from the
 * newest revision snapshot that still has them (and persist the heal).
 */
async function healHollowQuizBodiesFromRevisions(
  detail: OutlineDetail,
): Promise<OutlineDetail> {
  const hollow = detail.modules
    .flatMap((m) => m.items)
    .filter((i) => i.type === 'QUIZ' && isHollowQuizBody(i.body));
  if (hollow.length === 0) return detail;

  const healed = new Map<string, OutlineItemBody>();

  // 1) faithfulBody backup (set at build time)
  for (const item of hollow) {
    if (
      item.faithfulBody &&
      !isHollowQuizBody(item.faithfulBody)
    ) {
      const next = restoreQuizContentFromFallback(
        item.body,
        item.faithfulBody,
      );
      if (!isHollowQuizBody(next)) healed.set(item.id, next);
    }
  }

  // 2) revision snapshots (newest → oldest)
  const stillHollow = hollow.filter((i) => !healed.has(i.id));
  if (stillHollow.length > 0) {
    const revisions = await withOutlineTenant(
      detail.id,
      null,
      async (tx) =>
        tx.query.authoringRevisions.findMany({
          where: eq(authoringRevisions.outlineId, detail.id),
          orderBy: [desc(authoringRevisions.createdAt)],
          limit: 25,
          columns: { id: true, snapshot: true, createdAt: true, label: true },
        }),
    );

    for (const item of stillHollow) {
      for (const rev of revisions) {
        const snap = rev.snapshot as unknown as OutlineSnapshot | null;
        if (!snap?.modules) continue;
        const prior = snap.modules
          .flatMap((m) => m.items)
          .find((i) => i.id === item.id);
        const priorBody = prior?.body ?? prior?.faithfulBody ?? null;
        if (!priorBody || isHollowQuizBody(priorBody)) continue;
        const next = restoreQuizContentFromFallback(item.body, priorBody);
        if (!isHollowQuizBody(next)) {
          healed.set(item.id, next);
          break;
        }
      }
    }
  }

  if (healed.size === 0) return detail;

  await withOutlineTenant(detail.id, null, async (tx) => {
    for (const [itemId, body] of healed) {
      await tx
        .update(outlineItems)
        .set({ body, updatedAt: new Date() })
        .where(eq(outlineItems.id, itemId));
    }
  });

  const tree = await fetchOutlineTreeById(detail.id);
  if (!tree) return detail;
  return mapTreeToDetail(tree);
}

/** Shift quiz windows that start in the past onto a today-based weekly plan. */
async function replanPastQuizSchedules(
  detail: OutlineDetail,
): Promise<OutlineDetail> {
  const now = new Date();
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const quizzes = detail.modules.flatMap((m) =>
    m.items.filter((i) => i.type === 'QUIZ'),
  );
  if (quizzes.length === 0) return detail;

  const needsReplan = quizzes.some((q) => {
    const start = q.body?.startDate ? new Date(q.body.startDate) : null;
    const end = q.body?.endDate ? new Date(q.body.endDate) : null;
    if (!start && !end) return true; // missing schedule — fill from today
    if (start && !Number.isNaN(start.getTime()) && start.getTime() < dayAgo) {
      return true;
    }
    if (end && !Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) {
      return true;
    }
    return false;
  });
  if (!needsReplan) return detail;

  const flat = detail.modules.flatMap((m) => m.items);
  const replanned = replanOutlineQuizSchedules(flat, now);
  const byId = new Map(replanned.map((i) => [i.id, i.body]));

  await withOutlineTenant(detail.id, null, async (tx) => {
    for (const item of replanned) {
      if (item.type !== 'QUIZ') continue;
      const body = byId.get(item.id);
      if (!body) continue;
      await tx
        .update(outlineItems)
        .set({ body, updatedAt: new Date() })
        .where(eq(outlineItems.id, item.id));
    }
  });

  const tree = await fetchOutlineTreeById(detail.id);
  if (!tree) return detail;
  return mapTreeToDetail(tree);
}

export async function archiveOutline(user: AuthUser, outlineId: string) {
  await assertCanManageOutline(user, outlineId);
  return withOutlineTenant(outlineId, user.id, async (tx) => {
    const [row] = await tx
      .update(courseOutlines)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(courseOutlines.id, outlineId))
      .returning();
    return { id: row!.id, status: row!.status };
  });
}

/** Make an archived (or older) outline the editable current draft. */
export async function restoreOutlineAsCurrent(
  user: AuthUser,
  outlineId: string,
): Promise<OutlineDetail> {
  const outline = await assertCanManageOutline(user, outlineId);
  const nextStatus =
    outline.status === 'ARCHIVED'
      ? outline.bodiesBuilt
        ? 'READY'
        : 'DRAFT'
      : (outline.status as 'DRAFT' | 'READY' | 'ARCHIVED');

  await withOutlineTenant(outlineId, user.id, async (tx) => {
    await tx
      .update(courseOutlines)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(
        and(
          eq(courseOutlines.courseId, outline.courseId),
          isNull(courseOutlines.deletedAt),
          ne(courseOutlines.id, outlineId),
          ne(courseOutlines.status, 'ARCHIVED'),
        ),
      );

    await tx
      .update(courseOutlines)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(courseOutlines.id, outlineId));
  });

  return getOutlineDetail(user, outlineId);
}

export async function updateOutlineMeta(
  user: AuthUser,
  outlineId: string,
  input: { title?: string; status?: 'DRAFT' | 'READY' | 'ARCHIVED' },
) {
  await assertCanManageOutline(user, outlineId);
  return withOutlineTenant(outlineId, user.id, async (tx) => {
    const [row] = await tx
      .update(courseOutlines)
      .set({
        ...(input.title != null ? { title: input.title.trim() } : {}),
        ...(input.status != null ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(courseOutlines.id, outlineId))
      .returning();
    return { id: row!.id, title: row!.title, status: row!.status };
  });
}

export async function updateOutlineItem(
  user: AuthUser,
  itemId: string,
  input: {
    title?: string;
    body?: OutlineItemBody;
    status?: 'DRAFT' | 'PREVIEW' | 'PUBLISHED';
  },
): Promise<OutlineItemSummary> {
  const { item } = await assertCanManageItem(user, itemId);
  const { mergeOutlineItemBody } = await import('@/lib/authoring/bodyMerge');
  const nextBody =
    input.body != null
      ? mergeOutlineItemBody(
          (item.body ?? {}) as OutlineItemBody,
          input.body,
        )
      : undefined;
  return withItemTenant(itemId, user.id, async (tx) => {
    const [row] = await tx
      .update(outlineItems)
      .set({
        ...(input.title != null ? { title: input.title.trim() } : {}),
        ...(nextBody != null ? { body: nextBody } : {}),
        ...(input.status != null ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(outlineItems.id, itemId))
      .returning();
    return mapItem(row!);
  });
}

export async function listAuthoringMessages(
  user: AuthUser,
  outlineId: string,
  limit = 40,
) {
  await assertCanManageOutline(user, outlineId);
  const rows = await fetchAuthoringMessagesForOutline(outlineId, limit);
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.createdAt,
  }));
}

export async function persistGeneratedOutline(opts: {
  user: AuthUser;
  courseId: string;
  title: string;
  brief?: string | null;
  status?: 'DRAFT' | 'READY';
  hasPriorCorpus?: boolean;
  bodiesBuilt?: boolean;
  modules: Array<{
    title: string;
    summary?: string | null;
    items: Array<{
      type: 'LESSON' | 'QUIZ' | 'DISCUSSION' | 'INTERACTIVE';
      title: string;
      body: OutlineItemBody;
      sourceMaterialIds?: string[];
    }>;
  }>;
}): Promise<OutlineDetail> {
  const course = await fetchCourseById(opts.courseId);
  const tenantId = course?.tenantId ?? course?.workspaceId;
  if (!tenantId) {
    throw ApiError.badRequest('Course is missing tenant_id');
  }

  const itemCount = opts.modules.reduce((n, m) => n + m.items.length, 0);
  const userContent =
    opts.brief?.trim() ||
    `Propose an outline for ${opts.title || 'this course'}.`;
  const assistantContent = opts.bodiesBuilt
    ? `Created “${opts.title}” with ${opts.modules.length} modules and ${itemCount} assignments.`
    : `Proposed skeleton “${opts.title}” — ${opts.modules.length} modules, ${itemCount} assignments. Building assignment bodies…`;

  // SECURITY DEFINER: avoid Neon WS/GUC flakes that break WITH CHECK on insert.
  const outlineId = await persistCourseOutlineDefiner({
    tenantId,
    courseId: opts.courseId,
    createdByUserId: opts.user.id,
    title: opts.title,
    status: opts.status ?? 'READY',
    brief: opts.brief ?? null,
    hasPriorCorpus: opts.hasPriorCorpus ?? false,
    bodiesBuilt: opts.bodiesBuilt ?? true,
    userMessage: userContent,
    assistantMessage: assistantContent,
    modules: opts.modules.map((mod) => ({
      title: mod.title,
      summary: mod.summary ?? null,
      items: mod.items.map((item) => ({
        type: item.type,
        title: item.title,
        body: item.body ?? {},
        sourceMaterialIds: item.sourceMaterialIds ?? [],
      })),
    })),
  });

  const tree = await fetchOutlineTreeById(outlineId);
  if (!tree) {
    throw ApiError.badRequest('Outline was created but could not be loaded');
  }
  return mapTreeToDetail(tree);
}

export function requireItemBody(body: OutlineItemBody | null | undefined) {
  if (!body || typeof body !== 'object') {
    throw ApiError.badRequest('Item body is required');
  }
  return body;
}
