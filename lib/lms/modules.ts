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
  softDeleteModuleItemDefiner,
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

type TeachingUser = {
  id: string;
  clerkId: string;
  platformStaff?: boolean | null;
};

/**
 * Publish a whole module: mark the module + its items published, and release
 * linked QUIZ / LESSON / DISCUSSION / INTERACTIVE activities to students.
 * Unpublish only flips the module flag (does not unrelease activities).
 * Individual item publish must not call this — use updateModuleItem instead.
 */
export async function setModulePublished(
  user: TeachingUser,
  courseId: string,
  moduleId: string,
  published: boolean,
) {
  const mod = await updateModule(courseId, moduleId, { published });
  if (!published) return { module: mod, released: 0 };

  const items = await listModuleItemsDefiner(moduleId);
  const {
    setQuizVisibility,
    updateDiscussion,
  } = await import('@/lib/professor/mutations');
  const { setLessonVisibility } = await import('@/lib/learning/lessons');
  const { setInteractiveVisibility } = await import(
    '@/lib/interactives/mutations'
  );

  let released = 0;
  for (const item of items) {
    if (item.isHeader) continue;
    if (!item.published) {
      await updateModuleItem(moduleId, item.id, { published: true });
    }
    if (item.quizId) {
      await setQuizVisibility(user, item.quizId, true);
      released += 1;
    }
    if (item.chatbotId) {
      await updateDiscussion(user, item.chatbotId, { isActive: true });
      released += 1;
    }
    if (item.lessonId) {
      await setLessonVisibility(user, item.lessonId, true);
      released += 1;
    }
    if (item.interactiveId) {
      await setInteractiveVisibility(user, item.interactiveId, true);
      released += 1;
    }
  }
  return { module: mod, released };
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

export async function deleteModuleItem(moduleId: string, itemId: string) {
  try {
    return await softDeleteModuleItemDefiner(moduleId, itemId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/module_item_not_found|module_not_found/i.test(msg)) {
      throw ApiError.notFound('Module item not found');
    }
    throw err;
  }
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
