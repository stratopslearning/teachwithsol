/**
 * Runtime course modules (Canvas-like) — delivery surface.
 */
import { ApiError } from '@/lib/api/errors';
import {
  assignModuleSectionsDefiner,
  completeModuleItemDefiner,
  listCourseModulesDefiner,
  listModuleItemProgressDefiner,
  listModuleItemsDefiner,
  softDeleteCourseModuleDefiner,
  type CourseModuleRow,
  type ModuleItemRow,
  upsertCourseModuleDefiner,
  upsertModuleItemDefiner,
} from '@/lib/db/lmsDefiners';

export type ModuleWithItems = CourseModuleRow & {
  items: Array<ModuleItemRow & { completed?: boolean }>;
  locked?: boolean;
  lockReason?: string | null;
};

export async function listModulesWithItems(
  courseId: string,
): Promise<ModuleWithItems[]> {
  const modules = await listCourseModulesDefiner(courseId);
  const withItems = await Promise.all(
    modules.map(async (m) => ({
      ...m,
      items: await listModuleItemsDefiner(m.id),
    })),
  );
  return withItems;
}

export async function createModule(opts: {
  courseId: string;
  title: string;
  position?: number;
  published?: boolean;
  sectionIds?: string[];
}) {
  const mod = await upsertCourseModuleDefiner({
    courseId: opts.courseId,
    title: opts.title,
    position: opts.position ?? 0,
    published: opts.published ?? false,
  });
  if (!mod) throw ApiError.internal('Failed to create module');
  if (opts.sectionIds?.length) {
    await assignModuleSectionsDefiner(mod.id, opts.sectionIds);
  }
  return mod;
}

export async function updateModule(
  courseId: string,
  moduleId: string,
  patch: {
    title?: string;
    position?: number;
    published?: boolean;
    unlockAt?: string | null;
    prerequisiteModuleIds?: string[];
  },
) {
  const mod = await upsertCourseModuleDefiner({
    id: moduleId,
    courseId,
    ...patch,
  });
  if (!mod) throw ApiError.notFound('Module not found');
  return mod;
}

export async function deleteModule(courseId: string, moduleId: string) {
  try {
    return await softDeleteCourseModuleDefiner(courseId, moduleId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/module_not_found/i.test(msg)) {
      throw ApiError.notFound('Module not found');
    }
    throw err;
  }
}

export async function addModuleItem(
  moduleId: string,
  item: {
    title: string;
    type: string;
    position?: number;
    isHeader?: boolean;
    lessonId?: string | null;
    quizId?: string | null;
    chatbotId?: string | null;
    interactiveId?: string | null;
    pageId?: string | null;
    peerDiscussionId?: string | null;
    externalUrl?: string | null;
    completionRequirement?: ModuleItemRow['completionRequirement'];
    published?: boolean;
  },
) {
  const row = await upsertModuleItemDefiner({
    moduleId,
    ...item,
  });
  if (!row) throw ApiError.internal('Failed to create module item');
  return row;
}

export async function updateModuleItem(
  moduleId: string,
  itemId: string,
  patch: Partial<{
    title: string;
    position: number;
    published: boolean;
    completionRequirement: ModuleItemRow['completionRequirement'];
  }>,
) {
  const row = await upsertModuleItemDefiner({
    id: itemId,
    moduleId,
    ...patch,
  });
  if (!row) throw ApiError.notFound('Module item not found');
  return row;
}

/** Evaluate lock state for a student (prereqs + unlock date + published). */
export function evaluateModuleLocks(
  modules: ModuleWithItems[],
  completedModuleIds: Set<string>,
  now = new Date(),
): ModuleWithItems[] {
  return modules.map((m) => {
    if (!m.published) {
      return { ...m, locked: true, lockReason: 'Not published' };
    }
    if (m.unlockAt && m.unlockAt.getTime() > now.getTime()) {
      return {
        ...m,
        locked: true,
        lockReason: `Unlocks ${m.unlockAt.toLocaleString()}`,
      };
    }
    const missing = (m.prerequisiteModuleIds ?? []).filter(
      (id) => !completedModuleIds.has(id),
    );
    if (missing.length > 0) {
      return {
        ...m,
        locked: true,
        lockReason: 'Complete prerequisite modules first',
      };
    }
    return { ...m, locked: false, lockReason: null };
  });
}

/** Module complete when all items with completion requirements are done. */
export function modulesCompletedFromProgress(
  modules: ModuleWithItems[],
  completedItemIds: Set<string>,
): Set<string> {
  const done = new Set<string>();
  for (const m of modules) {
    const required = m.items.filter(
      (i) => !i.isHeader && i.completionRequirement && i.published,
    );
    if (required.length === 0) {
      // No requirements: complete if any non-header item completed, or empty published module
      const nonHeaders = m.items.filter((i) => !i.isHeader && i.published);
      if (
        nonHeaders.length === 0 ||
        nonHeaders.every((i) => completedItemIds.has(i.id))
      ) {
        if (m.published) done.add(m.id);
      }
      continue;
    }
    if (required.every((i) => completedItemIds.has(i.id))) {
      done.add(m.id);
    }
  }
  return done;
}

export async function loadStudentModulesView(opts: {
  courseId: string;
  studentId: string;
}): Promise<ModuleWithItems[]> {
  const modules = await listModulesWithItems(opts.courseId);
  const published = modules
    .map((m) => ({
      ...m,
      items: m.items.filter((i) => i.published),
    }))
    .filter((m) => m.published);

  const progress = await listModuleItemProgressDefiner(
    opts.studentId,
    published.map((m) => m.id),
  );
  const completedItems = new Set(
    progress
      .filter((p) => String((p as { status?: string }).status) === 'COMPLETED')
      .map((p) => String((p as { moduleItemId?: string }).moduleItemId)),
  );
  const completedModules = modulesCompletedFromProgress(
    published,
    completedItems,
  );
  const withProgress = published.map((m) => ({
    ...m,
    items: m.items.map((i) => ({
      ...i,
      completed: completedItems.has(i.id),
    })),
  }));
  return evaluateModuleLocks(withProgress, completedModules);
}

export async function markModuleItemComplete(opts: {
  moduleItemId: string;
  studentId: string;
}) {
  return completeModuleItemDefiner(opts);
}

export async function backfillModulesFromOutline(outlineId: string) {
  const { rebuildSmartModulesFromOutline } = await import(
    '@/lib/lms/smartModulesFromOutline'
  );
  const result = await rebuildSmartModulesFromOutline({
    outlineId,
    autoPublishModulesWithContent: true,
  });
  return {
    ...result,
    courseId: null as string | null,
  };
}

/**
 * After authoring publish: ensure a runtime module exists for the outline
 * module and attach the published activity as a module item.
 */
export async function syncPublishedOutlineItemToModule(opts: {
  courseId: string;
  outlineModuleId: string;
  outlineModuleTitle: string;
  outlineModulePosition: number;
  itemTitle: string;
  itemType: 'LESSON' | 'QUIZ' | 'DISCUSSION' | 'INTERACTIVE';
  publishedLessonId?: string | null;
  publishedQuizId?: string | null;
  publishedChatbotId?: string | null;
  publishedInteractiveId?: string | null;
  sectionIds?: string[];
}) {
  const existing = await listCourseModulesDefiner(opts.courseId);
  // Match by title+position first; otherwise create.
  let mod =
    existing.find(
      (m) =>
        m.title === opts.outlineModuleTitle &&
        m.position === opts.outlineModulePosition,
    ) ?? null;
  if (!mod) {
    mod = await upsertCourseModuleDefiner({
      courseId: opts.courseId,
      title: opts.outlineModuleTitle,
      position: opts.outlineModulePosition,
      published: false,
    });
  }
  if (!mod) return null;
  if (opts.sectionIds?.length) {
    await assignModuleSectionsDefiner(mod.id, opts.sectionIds);
  }

  const type =
    opts.itemType === 'DISCUSSION'
      ? 'TUTOR'
      : opts.itemType === 'INTERACTIVE'
        ? 'INTERACTIVE'
        : opts.itemType;

  return upsertModuleItemDefiner({
    moduleId: mod.id,
    title: opts.itemTitle,
    type,
    isHeader: false,
    lessonId: opts.publishedLessonId ?? null,
    quizId: opts.publishedQuizId ?? null,
    chatbotId: opts.publishedChatbotId ?? null,
    interactiveId: opts.publishedInteractiveId ?? null,
    published: false,
    completionRequirement:
      opts.itemType === 'QUIZ'
        ? { type: 'score_at_least', minPercent: 70 }
        : opts.itemType === 'LESSON'
          ? { type: 'view' }
          : { type: 'submit' },
  });
}
