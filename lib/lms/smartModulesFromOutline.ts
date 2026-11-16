/**
 * Build Canvas-like "smart" runtime modules from an authoring outline:
 * sequential prerequisites, unlock dates from quiz windows, headers,
 * and type-aware completion requirements.
 */
import type { OutlineItemBody } from '@/app/db/schema';
import {
  assignModuleSectionsDefiner,
  listCourseModulesDefiner,
  listModuleItemsDefiner,
  upsertCourseModuleDefiner,
  upsertModuleItemDefiner,
  type CourseModuleRow,
  type ModuleItemRow,
} from '@/lib/db/lmsDefiners';
import { fetchOutlineTreeById } from '@/lib/db/entityScopedReads';
import { planQuizWindowFromToday } from '@/lib/authoring/schedule';
import { DEFAULT_PASSING_SCORE } from '@/lib/quizSchemas';

export type SmartModulesBuildResult = {
  modulesCreated: number;
  modulesUpdated: number;
  itemsUpserted: number;
  moduleIds: string[];
};

function completionForItem(
  type: string,
  body: OutlineItemBody | null | undefined,
): ModuleItemRow['completionRequirement'] {
  if (type === 'QUIZ') {
    const min = Number(body?.passingScore ?? DEFAULT_PASSING_SCORE);
    return {
      type: 'score_at_least',
      minPercent: Number.isFinite(min)
        ? Math.min(100, Math.max(0, min))
        : DEFAULT_PASSING_SCORE,
    };
  }
  // Interactive chapters: complete when all practice section checks pass (submit).
  if (type === 'LESSON') {
    if (body?.chapter?.kind === 'interactive_chapter') {
      return { type: 'submit' };
    }
    return { type: 'view' };
  }
  return { type: 'submit' };
}

/** Prefer LESSON first, then QUIZ, INTERACTIVE, DISCUSSION, then others. */
function outlineItemSortKey(type: string): number {
  switch (type) {
    case 'LESSON':
      return 0;
    case 'QUIZ':
      return 1;
    case 'INTERACTIVE':
      return 2;
    case 'DISCUSSION':
      return 3;
    default:
      return 9;
  }
}

function runtimeType(type: string): string {
  if (type === 'DISCUSSION') return 'TUTOR';
  return type;
}

function earliestUnlock(items: Array<{ type: string; body?: OutlineItemBody | null }>, moduleIndex: number): string | null {
  let earliest: Date | null = null;
  for (const item of items) {
    if (item.type !== 'QUIZ') continue;
    const raw = item.body?.startDate;
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  if (earliest) return earliest.toISOString();
  // Stagger modules weekly when the outline has no quiz dates yet.
  const planned = planQuizWindowFromToday({ index: moduleIndex });
  return planned.startDate;
}

function activityKey(item: {
  type: string;
  publishedQuizId?: string | null;
  publishedLessonId?: string | null;
  publishedChatbotId?: string | null;
  publishedInteractiveId?: string | null;
}): string | null {
  if (item.publishedQuizId) return `quiz:${item.publishedQuizId}`;
  if (item.publishedLessonId) return `lesson:${item.publishedLessonId}`;
  if (item.publishedChatbotId) return `chatbot:${item.publishedChatbotId}`;
  if (item.publishedInteractiveId) {
    return `interactive:${item.publishedInteractiveId}`;
  }
  return null;
}

/**
 * Upsert the full smart module tree for an outline into the course.
 * Safe to re-run: matches modules by position, items by linked activity id.
 */
export async function rebuildSmartModulesFromOutline(opts: {
  outlineId: string;
  sectionIds?: string[];
  /** When true, publish modules that have at least one published activity. */
  autoPublishModulesWithContent?: boolean;
}): Promise<SmartModulesBuildResult> {
  const tree = await fetchOutlineTreeById(opts.outlineId);
  if (!tree) {
    return { modulesCreated: 0, modulesUpdated: 0, itemsUpserted: 0, moduleIds: [] };
  }

  const courseId = tree.courseId;
  const outlineModules = [...(tree.modules ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  let modulesCreated = 0;
  let modulesUpdated = 0;
  let itemsUpserted = 0;
  const runtimeIds: string[] = [];
  let previousModuleId: string | null = null;

  const existing = await listCourseModulesDefiner(courseId);

  for (let mi = 0; mi < outlineModules.length; mi++) {
    const omod = outlineModules[mi]!;
    const items = [...(omod.items ?? [])].sort((a, b) => {
      const byType =
        outlineItemSortKey(a.type) - outlineItemSortKey(b.type);
      if (byType !== 0) return byType;
      return a.position - b.position;
    });

    const unlockAt = earliestUnlock(
      items.map((i) => ({
        type: i.type,
        body: (i.body ?? null) as OutlineItemBody | null,
      })),
      mi,
    );

    const prerequisiteModuleIds = previousModuleId ? [previousModuleId] : [];
    const hasPublishedActivity = items.some(
      (i) =>
        i.publishedQuizId ||
        i.publishedLessonId ||
        i.publishedChatbotId ||
        i.publishedInteractiveId,
    );
    const published =
      opts.autoPublishModulesWithContent === true && hasPublishedActivity
        ? true
        : false;

    const matched =
      existing.find((m) => m.position === omod.position) ??
      existing.find((m) => m.title === omod.title) ??
      null;

    let mod: CourseModuleRow | null;
    if (matched) {
      mod = await upsertCourseModuleDefiner({
        id: matched.id,
        courseId,
        title: omod.title,
        position: omod.position,
        unlockAt,
        prerequisiteModuleIds,
        published: matched.published || published,
      });
      modulesUpdated += 1;
    } else {
      mod = await upsertCourseModuleDefiner({
        courseId,
        title: omod.title,
        position: omod.position,
        unlockAt,
        prerequisiteModuleIds,
        published,
      });
      modulesCreated += 1;
    }
    if (!mod) continue;

    runtimeIds.push(mod.id);
    previousModuleId = mod.id;
    if (opts.sectionIds?.length) {
      await assignModuleSectionsDefiner(mod.id, opts.sectionIds);
    }

    const currentItems = await listModuleItemsDefiner(mod.id);
    const byActivity = new Map<string, ModuleItemRow>();
    const byTitle = new Map<string, ModuleItemRow>();
    for (const row of currentItems) {
      byTitle.set(row.title, row);
      if (row.quizId) byActivity.set(`quiz:${row.quizId}`, row);
      if (row.lessonId) byActivity.set(`lesson:${row.lessonId}`, row);
      if (row.chatbotId) byActivity.set(`chatbot:${row.chatbotId}`, row);
      if (row.interactiveId) {
        byActivity.set(`interactive:${row.interactiveId}`, row);
      }
    }

    let position = 0;

    // Header from outline summary (Canvas-style text header).
    if (omod.summary?.trim()) {
      const overviewTitle = `Overview · ${omod.summary.trim().slice(0, 120)}`;
      const existingHeader = byTitle.get(overviewTitle);
      await upsertModuleItemDefiner({
        id: existingHeader?.id,
        moduleId: mod.id,
        title: overviewTitle,
        type: 'HEADER',
        isHeader: true,
        position: position++,
        published: true,
        completionRequirement: null,
      });
      itemsUpserted += 1;
    }

    for (const item of items) {
      const body = (item.body ?? null) as OutlineItemBody | null;
      const key = activityKey(item);
      const existingItem = key
        ? byActivity.get(key)
        : byTitle.get(`${item.title} (draft)`) ?? byTitle.get(item.title);

      // Before publish: placeholder so Modules shows the planned sequence.
      if (!key) {
        const draftTitle = `${item.title} (draft)`;
        await upsertModuleItemDefiner({
          id: existingItem?.id,
          moduleId: mod.id,
          title: draftTitle,
          type: 'HEADER',
          isHeader: true,
          position: position++,
          published: false,
          completionRequirement: null,
        });
        itemsUpserted += 1;
        continue;
      }

      await upsertModuleItemDefiner({
        id: existingItem?.id,
        moduleId: mod.id,
        title: item.title,
        type: runtimeType(item.type),
        isHeader: false,
        position: position++,
        lessonId: item.publishedLessonId ?? null,
        quizId: item.publishedQuizId ?? null,
        chatbotId: item.publishedChatbotId ?? null,
        interactiveId: item.publishedInteractiveId ?? null,
        published: Boolean(
          item.publishedQuizId ||
            item.publishedLessonId ||
            item.publishedChatbotId ||
            item.publishedInteractiveId,
        ),
        completionRequirement: completionForItem(item.type, body),
      });
      itemsUpserted += 1;
    }
  }

  return {
    modulesCreated,
    modulesUpdated,
    itemsUpserted,
    moduleIds: runtimeIds,
  };
}
