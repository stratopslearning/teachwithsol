import { getAiClientForTask, resolveModel } from '@/lib/ai/gateway';
import { temperatureForModel } from '@/lib/ai/modelRouter';
import { loadCoursePromptContext } from '@/lib/ai/prompts/courseContext';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { ApiError } from '@/lib/api/errors';
import { assertCanManageOutline } from '@/lib/authoring/access';
import { AUTHORING_PROMPT_VERSION } from '@/lib/authoring/constants';
import {
  buildAuthoringMaterialsContext,
} from '@/lib/authoring/context';
import {
  assembleFaithfulItemBodies,
  type FaithfulItemPatch,
} from '@/lib/authoring/faithfulBuild';
import {
  getOutlineDetail,
  persistGeneratedOutline,
  type OutlineDetail,
} from '@/lib/authoring/outlines';
import { getAuthoringPolicyForCourse } from '@/lib/authoring/policies';
import {
  buildFaithfulBuildSystemPrompt,
  defaultAuthoringQuery,
  formatAuthoringPolicyPrompt,
} from '@/lib/authoring/prompts';
import {
  createAuthoringRevision,
  snapshotFromOutline,
} from '@/lib/authoring/revisions';
import { applyOutlineBuildDefiner } from '@/lib/db/entityScopedReads';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { UserData } from '@/lib/getOrCreateUser';
import { isInteractiveChapterReady } from '@/lib/lms/interactiveChapter';

type AuthUser = Pick<UserData, 'id' | 'clerkId'> & {
  platformStaff?: boolean | null;
};

export function moduleNeedsInteractiveLesson(mod: {
  items: Array<{ type: string; body?: { chapter?: unknown } | null }>;
}): boolean {
  const first = mod.items[0];
  if (!first || first.type !== 'LESSON') return true;
  return !isInteractiveChapterReady(first.body?.chapter);
}

export function outlineNeedsInteractiveLessons(detail: OutlineDetail): boolean {
  if (detail.modules.length === 0) return false;
  return detail.modules.some((mod) => moduleNeedsInteractiveLesson(mod));
}

function lessonTitleForModule(moduleTitle: string): string {
  const cleaned = moduleTitle
    .replace(/^(week\s*\d+\s*[—–\-:]?\s*)/i, '')
    .trim();
  return cleaned
    ? `Interactive chapter: ${cleaned}`
    : 'Interactive chapter';
}

/**
 * Prepend a Shah-style LESSON to every module that lacks one, then build
 * interactive chapter bodies. Archives the prior outline and returns the new one
 * (same pattern as regenerate).
 */
export async function ensureInteractiveLessonsForOutline(
  user: AuthUser,
  outlineId: string,
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<{
  outline: OutlineDetail;
  lessonsAdded: number;
  lessonsBuilt: number;
  alreadyComplete: boolean;
}> {
  const outlineRow = await assertCanManageOutline(user, outlineId);
  const detail = await getOutlineDetail(user, outlineId);

  if (!outlineNeedsInteractiveLessons(detail)) {
    return {
      outline: detail,
      lessonsAdded: 0,
      lessonsBuilt: 0,
      alreadyComplete: true,
    };
  }

  await createAuthoringRevision(
    user,
    outlineId,
    'Before interactive lessons',
    snapshotFromOutline(detail),
  );

  let lessonsAdded = 0;
  const modules = detail.modules.map((mod) => {
    const items = [...mod.items];
    const needsLesson = moduleNeedsInteractiveLesson(mod);
    if (needsLesson && items[0]?.type !== 'LESSON') {
      lessonsAdded += 1;
      items.unshift({
        id: 'pending',
        moduleId: mod.id,
        type: 'LESSON' as const,
        title: lessonTitleForModule(mod.title),
        status: 'DRAFT' as const,
        body: {
          chapter: {
            kind: 'interactive_chapter' as const,
            learningObjectives: [],
            sections: [
              {
                id: 's1',
                title: 'Introduction',
                markdown: '',
                checkBank: [],
              },
            ],
          },
          description: 'Interactive chapter — building…',
        },
        sourceMaterialIds: [],
        variantOfItemId: null,
        faithfulBody: null,
        publishedQuizId: null,
        publishedChatbotId: null,
        publishedLessonId: null,
        publishedInteractiveId: null,
        position: 0,
      });
    }
    return {
      title: mod.title,
      summary: mod.summary,
      items: items.map((item) => ({
        type: item.type as 'LESSON' | 'QUIZ' | 'DISCUSSION' | 'INTERACTIVE',
        title: item.title,
        body: item.body ?? {},
        sourceMaterialIds: item.sourceMaterialIds ?? [],
      })),
    };
  });

  if (lessonsAdded === 0) {
    // Modules already start with LESSON but chapters are hollow — rebuild bodies.
    const built = await buildLessonBodies(user, detail, audit);
    return {
      outline: built.outline,
      lessonsAdded: 0,
      lessonsBuilt: built.lessonsBuilt,
      alreadyComplete: false,
    };
  }

  const next = await persistGeneratedOutline({
    user,
    courseId: outlineRow.courseId,
    title: detail.title,
    brief: detail.brief,
    status: 'READY',
    hasPriorCorpus: detail.hasPriorCorpus,
    bodiesBuilt: true,
    modules,
  });

  const built = await buildLessonBodies(user, next, audit);
  void logAiSpan('authoring.ensure_lessons', 'authoring', {
    outlineId: hashId(built.outline.id),
    lessonsAdded,
    lessonsBuilt: built.lessonsBuilt,
  });

  return {
    outline: built.outline,
    lessonsAdded,
    lessonsBuilt: built.lessonsBuilt,
    alreadyComplete: false,
  };
}

async function buildLessonBodies(
  user: AuthUser,
  detail: OutlineDetail,
  _audit?: { ip?: string | null; userAgent?: string | null },
): Promise<{ outline: OutlineDetail; lessonsBuilt: number }> {
  const lessonTargets = detail.modules.flatMap((mod) =>
    mod.items
      .filter(
        (item) =>
          item.type === 'LESSON' &&
          !isInteractiveChapterReady(item.body?.chapter),
      )
      .map((item) => ({
        moduleTitle: mod.title,
        moduleSummary: mod.summary,
        itemId: item.id,
        title: item.title,
      })),
  );

  if (lessonTargets.length === 0) {
    return { outline: detail, lessonsBuilt: 0 };
  }

  if (!process.env.OPENAI_API_KEY) {
    throw ApiError.badRequest('OpenAI is not configured');
  }

  const course = await assertCanManageCourse(user, detail.courseId);
  const policy = await getAuthoringPolicyForCourse(detail.courseId);
  const query = detail.brief?.trim() || defaultAuthoringQuery(course.title);
  const { text: materialsContext } = await buildAuthoringMaterialsContext(
    detail.courseId,
    query,
    { preferPrior: true },
  );
  if (!materialsContext.trim()) {
    throw ApiError.badRequest('No materials context for interactive lessons');
  }

  const openai = getAiClientForTask('build', { timeout: 90_000 });
  const buildModel = resolveModel('build').model;
  const courseCtx = await loadCoursePromptContext(detail.courseId);
  const buildSystem = buildFaithfulBuildSystemPrompt(courseCtx);
  const policyBlock = formatAuthoringPolicyPrompt(policy);

  const patches: FaithfulItemPatch[] = [];
  for (const target of lessonTargets) {
    const expected = [
      {
        itemId: target.itemId,
        type: 'LESSON' as const,
        title: target.title,
      },
    ];
    const baseUserMsg = `Course: ${course.title}
MODE: materials-grounded interactive chapter (Shah-style).
Build a complete LESSON interactive_chapter body for this module only.

Module: ${target.moduleTitle}
${target.moduleSummary ? `Summary: ${target.moduleSummary}\n` : ''}Item:
${JSON.stringify(expected)}

Materials:
${materialsContext}${policyBlock}`;

    let lastReason = 'Interactive lesson build didn’t come together';
    let built: FaithfulItemPatch[] | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const userMsg =
        attempt === 0
          ? baseUserMsg
          : `${baseUserMsg}

The previous JSON failed validation: ${lastReason}
Return corrected JSON with kind "interactive_chapter", 4–10 sections, >=4 learningObjectives, and >=6 checkBank MC questions per section.`;
      try {
        const buildTemp = temperatureForModel(
          buildModel,
          attempt === 0 ? 0.35 : 0.2,
        );
        const completion = await openai.chat.completions.create({
          model: buildModel,
          ...(buildTemp != null ? { temperature: buildTemp } : {}),
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${buildSystem}\nPROMPT_VERSION=${AUTHORING_PROMPT_VERSION}`,
            },
            { role: 'user', content: userMsg },
          ],
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('empty response');
        built = assembleFaithfulItemBodies(expected, JSON.parse(content));
        break;
      } catch (error) {
        lastReason =
          error instanceof Error ? error.message : 'validation failed';
        console.warn('[ensureInteractiveLessons] lesson build failed', {
          module: target.moduleTitle,
          attempt,
          reason: lastReason,
        });
      }
    }
    if (!built) {
      throw ApiError.badRequest(
        `Couldn’t build lesson for “${target.moduleTitle}”: ${lastReason}`,
      );
    }
    patches.push(...built);
  }

  await applyOutlineBuildDefiner({
    outlineId: detail.id,
    patches: patches.map((patch) => ({
      itemId: patch.itemId,
      title: patch.title,
      body: patch.body,
      sourceMaterialIds: patch.sourceMaterialIds ?? [],
    })),
    hasPriorCorpus: detail.hasPriorCorpus,
    aiMeta: {
      promptVersion: AUTHORING_PROMPT_VERSION,
      model: buildModel,
      task: 'ensure_lessons',
      tier: resolveModel('build').tier,
    },
  });

  await createAuthoringRevision(user, detail.id, 'Interactive lessons built');

  try {
    const { rebuildSmartModulesFromOutline } = await import(
      '@/lib/lms/smartModulesFromOutline'
    );
    const { listTeachableSectionIdsForCourse } = await import(
      '@/lib/authoring/access'
    );
    const sectionIds = await listTeachableSectionIdsForCourse(
      user,
      detail.courseId,
    );
    await rebuildSmartModulesFromOutline({
      outlineId: detail.id,
      sectionIds,
      autoPublishModulesWithContent: false,
    });
  } catch (err) {
    console.warn('[ensureInteractiveLessons] smart modules skipped', err);
  }

  const outline = await getOutlineDetail(user, detail.id);
  return { outline, lessonsBuilt: patches.length };
}
