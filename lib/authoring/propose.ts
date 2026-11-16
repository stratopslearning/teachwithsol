import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { outlineItems, type OutlineItemBody } from '@/app/db/schema';
import { getAiClientForTask, resolveModel } from '@/lib/ai/gateway';
import { temperatureForModel } from '@/lib/ai/modelRouter';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { ApiError } from '@/lib/api/errors';
import { logAudit } from '@/lib/audit';
import { AUTHORING_PROMPT_VERSION } from '@/lib/authoring/constants';
import {
  assertCourseHasReadyMaterials,
  buildAuthoringMaterialsContext,
  getCourseAuthoringMaterialStats,
} from '@/lib/authoring/context';
import { OUTLINE_ITEM_TYPES } from '@/app/db/enums';
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
import { loadCoursePromptContext } from '@/lib/ai/prompts/courseContext';
import {
  buildFaithfulBuildSystemPrompt,
  buildSkeletonSystemPrompt,
  defaultAuthoringQuery,
  formatAuthoringPolicyPrompt,
} from '@/lib/authoring/prompts';
import { reviewOutlineDraft } from '@/lib/authoring/review';
import {
  createAuthoringRevision,
  snapshotFromOutline,
} from '@/lib/authoring/revisions';
import { assertCanManageOutline } from '@/lib/authoring/access';
import {
  resolveCourseTenantId,
  withOutlineTenant,
} from '@/lib/authoring/tenant';
import { applyOutlineBuildDefiner } from '@/lib/db/entityScopedReads';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { AuthUser } from '@/lib/getOrCreateUser';

const skeletonItemSchema = z.object({
  type: z.enum(OUTLINE_ITEM_TYPES),
  title: z.string().min(1).max(200),
  interactiveKind: z
    .enum(['FILL_BLANKS', 'DRAG_WORDS', 'IMAGE_HOTSPOTS', 'ACCORDION'])
    .optional(),
  /** Optional section titles for LESSON interactive chapters. */
  sectionTitles: z.array(z.string().min(1).max(200)).max(12).optional(),
});

const skeletonSchema = z.object({
  title: z.string().min(1).max(200),
  modules: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        summary: z.string().optional(),
        items: z.array(skeletonItemSchema).min(1),
      }),
    )
    .min(1)
    .max(12),
});

function assertSkeletonMix(
  data: z.infer<typeof skeletonSchema>,
): void {
  let hasDiscussion = false;
  let hasFill = false;
  for (const mod of data.modules) {
    const first = mod.items[0];
    if (!first || first.type !== 'LESSON') {
      throw ApiError.badRequest(
        `Module “${mod.title}” must start with an interactive LESSON chapter`,
      );
    }
    const types = new Set(mod.items.map((i) => i.type));
    if (!types.has('QUIZ')) {
      throw ApiError.badRequest(
        `Module “${mod.title}” must include at least one QUIZ after the lesson`,
      );
    }
    if (types.has('DISCUSSION')) hasDiscussion = true;
    for (const item of mod.items) {
      if (
        item.type === 'INTERACTIVE' &&
        item.interactiveKind === 'FILL_BLANKS'
      ) {
        hasFill = true;
      }
    }
  }
  if (!hasDiscussion) {
    throw ApiError.badRequest(
      'Outline must include at least one DISCUSSION activity',
    );
  }
  if (!hasFill) {
    throw ApiError.badRequest(
      'Outline must include at least one FILL_BLANKS interactive',
    );
  }
}

/**
 * Propose outline from materials, then immediately write full assignment
 * bodies (quizzes / discussions / interactives). Same path as the old
 * skeleton → approve & build flow, in one request.
 */
export async function proposeOutlineSkeleton(
  user: AuthUser,
  opts: { courseId: string; brief?: string; materialIds?: string[] },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<OutlineDetail> {
  const course = await assertCanManageCourse(user, opts.courseId);
  {
    const { requireCourseTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireCourseTeaching(opts.courseId, user);
  }
  await assertCourseHasReadyMaterials(opts.courseId);
  const stats = await getCourseAuthoringMaterialStats(opts.courseId);
  const policy = await getAuthoringPolicyForCourse(opts.courseId);

  const query = opts.brief?.trim() || defaultAuthoringQuery(course.title);
  const { text: materialsContext, chunks, hasPriorCorpus } =
    await buildAuthoringMaterialsContext(opts.courseId, query, {
      preferPrior: true,
      materialIds: opts.materialIds,
    });

  if (!materialsContext.trim()) {
    throw ApiError.badRequest(
      opts.materialIds && opts.materialIds.length > 0
        ? 'No indexed chunks for the focused materials. Clear focus or pick Ready library docs, then try again.'
        : 'No indexed material chunks found. Wait for materials to finish processing.',
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    throw ApiError.badRequest('OpenAI is not configured');
  }

  const openai = getAiClientForTask('skeleton', { timeout: 90_000 });
  const skeletonModel = resolveModel('skeleton').model;
  const policyBlock = formatAuthoringPolicyPrompt(policy);
  const courseCtx = await loadCoursePromptContext(opts.courseId);
  const skeletonSystem = buildSkeletonSystemPrompt(courseCtx);
  const userMsg = `Course: ${course.title}
${opts.brief?.trim() ? `Instructor brief: ${opts.brief.trim()}\n` : ''}
${hasPriorCorpus ? 'Prior-course materials ARE present — mirror that structure.\n' : 'No prior-course tag — propose a sensible assessment-first structure.\n'}
Materials:
${materialsContext}${policyBlock}`;

  let parsed: z.infer<typeof skeletonSchema> | null = null;
  let lastError = 'Outline skeleton didn’t come together';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const skeletonTemp = temperatureForModel(
        skeletonModel,
        attempt === 0 ? 0.3 : 0.2,
      );
      const completion = await openai.chat.completions.create({
        model: skeletonModel,
        ...(skeletonTemp != null ? { temperature: skeletonTemp } : {}),
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${skeletonSystem}\nPROMPT_VERSION=${AUTHORING_PROMPT_VERSION}`,
          },
          {
            role: 'user',
            content:
              attempt === 0
                ? userMsg
                : `${userMsg}

The previous JSON failed validation: ${lastError}
Return a corrected FULL skeleton JSON. Every module needs >=1 QUIZ; the outline needs >=1 DISCUSSION and >=1 FILL_BLANKS interactive (set interactiveKind). Items are titles/types only.`,
          },
        ],
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error('empty');
      const raw = JSON.parse(content) as unknown;
      const candidate = skeletonSchema.safeParse(raw);
      if (!candidate.success) {
        lastError =
          candidate.error.issues[0]?.message ?? 'schema error';
        continue;
      }
      try {
        assertSkeletonMix(candidate.data);
      } catch (mixErr) {
        lastError =
          mixErr instanceof Error ? mixErr.message : 'activity mix invalid';
        continue;
      }
      parsed = candidate.data;
      break;
    } catch (err) {
      console.error('proposeOutlineSkeleton failed', err);
      lastError =
        err instanceof Error ? err.message : 'Outline skeleton didn’t come together';
    }
  }
  if (!parsed) {
    throw ApiError.badRequest(lastError);
  }

  const modules = parsed.modules.map((mod) => ({
    title: mod.title,
    summary: mod.summary ?? null,
    items: mod.items.map((item) => ({
      type: item.type as 'LESSON' | 'QUIZ' | 'DISCUSSION' | 'INTERACTIVE',
      title: item.title,
      body: {
        ...(item.type === 'INTERACTIVE' && item.interactiveKind
          ? { interactiveKind: item.interactiveKind }
          : {}),
        ...(item.type === 'LESSON' && item.sectionTitles?.length
          ? {
              chapter: {
                kind: 'interactive_chapter' as const,
                learningObjectives: [],
                sections: item.sectionTitles.map((title, i) => ({
                  id: `s${i + 1}`,
                  title,
                  markdown: '',
                  checkBank: [],
                })),
              },
            }
          : {}),
        description: 'Awaiting approval — bodies not built yet.',
      } satisfies OutlineItemBody,
    })),
  }));

  const outline = await persistGeneratedOutline({
    user,
    courseId: opts.courseId,
    title: parsed.title,
    brief: opts.brief ?? null,
    status: 'DRAFT',
    hasPriorCorpus: hasPriorCorpus || stats.hasPriorCorpus,
    bodiesBuilt: false,
    modules,
  });

  await createAuthoringRevision(
    user,
    outline.id,
    'Proposed skeleton',
    snapshotFromOutline(outline),
  );

  const tenantId = await resolveCourseTenantId(opts.courseId);
  try {
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'professor.authoring.propose_skeleton',
      targetType: 'course_outline',
      targetId: outline.id,
      tenantId,
      metadata: {
        courseId: opts.courseId,
        hasPriorCorpus: outline.hasPriorCorpus,
        chunkCount: chunks.length,
      },
      ip: audit?.ip ?? null,
      userAgent: audit?.userAgent ?? null,
    });
  } catch (err) {
    // Outline is already persisted — don't fail the whole propose on audit RLS.
    console.error('[proposeOutlineSkeleton] audit skipped', err);
  }

  // Build complete assignment bodies in the same request so the instructor
  // lands on ready quizzes/discussions/interactives — not "Not built yet".
  try {
    return await approveAndBuildOutline(user, outline.id, audit);
  } catch (error) {
    console.error(
      '[proposeOutlineSkeleton] auto-build failed; returning skeleton',
      error,
    );
    // Skeleton is still usable — UI can offer Approve & build as fallback.
    return getOutlineDetail(user, outline.id);
  }
}

/**
 * Approve skeleton → READY, then faithfully fill assignment bodies.
 */
export async function approveAndBuildOutline(
  user: AuthUser,
  outlineId: string,
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<OutlineDetail> {
  const outlineRow = await assertCanManageOutline(user, outlineId);
  {
    const { requireCourseTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireCourseTeaching(outlineRow.courseId, user);
  }
  const detail = await getOutlineDetail(user, outlineId);

  if (detail.bodiesBuilt && detail.status === 'READY') {
    return detail;
  }

  await createAuthoringRevision(user, outlineId, 'Before faithful build');

  const course = await assertCanManageCourse(user, outlineRow.courseId);
  const policy = await getAuthoringPolicyForCourse(outlineRow.courseId);
  const query =
    detail.brief?.trim() || defaultAuthoringQuery(course.title);
  const { text: materialsContext, hasPriorCorpus } =
    await buildAuthoringMaterialsContext(outlineRow.courseId, query, {
      preferPrior: true,
    });

  if (!materialsContext.trim()) {
    throw ApiError.badRequest('No materials context for faithful build');
  }
  if (!process.env.OPENAI_API_KEY) {
    throw ApiError.badRequest('OpenAI is not configured');
  }

  const openai = getAiClientForTask('build', { timeout: 90_000 });
  const buildModel = resolveModel('build').model;
  const policyBlock = formatAuthoringPolicyPrompt(policy);
  const courseCtx = await loadCoursePromptContext(outlineRow.courseId);
  const buildSystem = buildFaithfulBuildSystemPrompt(courseCtx);
  const modeNote = hasPriorCorpus || detail.hasPriorCorpus
    ? 'MODE: faithful mimic of prior-course assignments.'
    : 'MODE: materials-grounded full bodies (no prior tag).';

  const moduleBatches = detail.modules
    .map((mod) => ({
      title: mod.title,
      summary: mod.summary,
      items: mod.items
        .filter(
          (item): item is typeof item & {
            type: 'LESSON' | 'QUIZ' | 'DISCUSSION' | 'INTERACTIVE';
          } =>
            item.type === 'LESSON' ||
            item.type === 'QUIZ' ||
            item.type === 'DISCUSSION' ||
            item.type === 'INTERACTIVE',
        )
        .map((item) => ({
          itemId: item.id,
          type: item.type,
          title: item.title,
          interactiveKind: item.body?.interactiveKind,
        })),
    }))
    .filter((mod) => mod.items.length > 0);

  if (moduleBatches.length === 0) {
    throw ApiError.badRequest('This outline has no items to build');
  }

  async function buildModule(
    mod: (typeof moduleBatches)[number],
  ): Promise<FaithfulItemPatch[]> {
    const {
      authoringScheduleContext,
      planQuizWindowFromToday,
    } = await import('@/lib/authoring/schedule');
    // Absolute quiz index across the outline so week-1 ≠ week-1 in every module.
    let quizOrdinal = 0;
    for (const earlier of moduleBatches) {
      if (earlier === mod) break;
      quizOrdinal += earlier.items.filter((i) => i.type === 'QUIZ').length;
    }
    const plannedWindows = mod.items
      .filter((i) => i.type === 'QUIZ')
      .map((i, localIdx) => {
        const planned = planQuizWindowFromToday({
          index: quizOrdinal + localIdx,
        });
        return {
          itemId: i.itemId,
          title: i.title,
          startDate: planned.startDate,
          endDate: planned.endDate,
          suggestedTimeLimitMin: 30,
          suggestedMaxAttempts: 1,
          suggestedPassingScore: 70,
        };
      });
    const baseUserMsg = `Course: ${course.title}
${modeNote}
Schedule context: ${authoringScheduleContext()}
Planned quiz windows for THIS module (copy startDate/endDate onto each QUIZ body):
${JSON.stringify(plannedWindows)}

Build complete bodies for this module only. Return {"items":[...]} with every itemId below copied exactly.
Every QUIZ must include maxAttempts, passingScore, timeLimit, startDate, endDate, and points on each question.

Module: ${mod.title}
${mod.summary ? `Summary: ${mod.summary}\n` : ''}Items:
${JSON.stringify(mod.items)}

Materials:
${materialsContext}${policyBlock}`;

    let lastReason = 'Faithful build didn’t come together';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const userMsg =
        attempt === 0
          ? baseUserMsg
          : `${baseUserMsg}

The previous JSON failed validation: ${lastReason}
Return a corrected JSON object for these same itemIds. Every quiz needs 5–8 questions, including one short answer with concept tags. Every discussion needs systemPrompt and instructions. Every interactive needs a valid interactiveBody object.`;
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
        const raw = JSON.parse(content) as unknown;
        return assembleFaithfulItemBodies(mod.items, raw);
      } catch (error) {
        lastReason =
          error instanceof Error ? error.message : 'validation failed';
        console.warn('[approveAndBuildOutline] module build failed', {
          module: mod.title,
          attempt,
          reason: lastReason,
        });
      }
    }

    throw ApiError.badRequest(
      `Couldn’t build “${mod.title}”: ${lastReason}`,
    );
  }

  const patches: FaithfulItemPatch[] = [];
  const concurrency = 2;
  let cursor = 0;
  async function worker() {
    while (cursor < moduleBatches.length) {
      const index = cursor;
      cursor += 1;
      const built = await buildModule(moduleBatches[index]!);
      patches.push(...built);
    }
  }
  try {
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, moduleBatches.length) },
        () => worker(),
      ),
    );
  } catch (error) {
    console.error('approveAndBuildOutline failed', error);
    if (error instanceof ApiError) throw error;
    throw ApiError.badRequest('Faithful build didn’t come together');
  }

  const expectedCount = moduleBatches.reduce(
    (sum, mod) => sum + mod.items.length,
    0,
  );
  if (patches.length !== expectedCount) {
    throw ApiError.badRequest(
      'Faithful build did not return every assignment',
    );
  }

  // Server-side schedule/scoring so the first propose→build is complete
  // even if the model omits dates/points.
  const { ensureQuizAssignmentDefaults } = await import(
    '@/lib/authoring/schedule'
  );
  const typeById = new Map(
    moduleBatches.flatMap((mod) =>
      mod.items.map((item) => [item.itemId, item.type] as const),
    ),
  );
  const orderedIds = moduleBatches.flatMap((mod) =>
    mod.items.map((item) => item.itemId),
  );
  const patchById = new Map(patches.map((p) => [p.itemId, p]));
  let quizIndex = 0;
  const scheduledPatches = orderedIds.map((itemId) => {
    const patch = patchById.get(itemId);
    if (!patch) {
      throw ApiError.badRequest('Faithful build did not return every assignment');
    }
    if (typeById.get(itemId) !== 'QUIZ') return patch;
    const body = ensureQuizAssignmentDefaults(patch.body, quizIndex);
    quizIndex += 1;
    return { ...patch, body };
  });

  await applyOutlineBuildDefiner({
    outlineId,
    patches: scheduledPatches.map((patch) => ({
      itemId: patch.itemId,
      title: patch.title,
      body: patch.body,
      sourceMaterialIds: patch.sourceMaterialIds ?? [],
    })),
    hasPriorCorpus: hasPriorCorpus || detail.hasPriorCorpus,
    aiMeta: {
      promptVersion: AUTHORING_PROMPT_VERSION,
      model: buildModel,
      task: 'build',
      tier: resolveModel('build').tier,
    },
  });

  // Freeze built content as faithfulBody so later schedule refines can recover stems.
  await withOutlineTenant(outlineId, user.id, async (tx) => {
    for (const patch of scheduledPatches) {
      if (typeById.get(patch.itemId) !== 'QUIZ') continue;
      await tx
        .update(outlineItems)
        .set({
          faithfulBody: patch.body,
          updatedAt: new Date(),
        })
        .where(eq(outlineItems.id, patch.itemId));
    }
  });

  await createAuthoringRevision(user, outlineId, 'Faithful build complete');

  try {
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'professor.authoring.approve_build',
      targetType: 'course_outline',
      targetId: outlineId,
      tenantId: await resolveCourseTenantId(outlineRow.courseId),
      metadata: { hasPriorCorpus: hasPriorCorpus || detail.hasPriorCorpus },
      ip: audit?.ip ?? null,
      userAgent: audit?.userAgent ?? null,
    });
  } catch (err) {
    console.error('[approveAndBuildOutline] audit skipped', err);
  }

  const built = await getOutlineDetail(user, outlineId);

  // Materialize Canvas-like Modules as soon as bodies exist (draft placeholders
  // + sequential prereqs + weekly unlocks from quiz windows).
  try {
    const { rebuildSmartModulesFromOutline } = await import(
      '@/lib/lms/smartModulesFromOutline'
    );
    const { listTeachableSectionIdsForCourse } = await import(
      '@/lib/authoring/access'
    );
    const sectionIds = await listTeachableSectionIdsForCourse(
      user,
      outlineRow.courseId,
    );
    await rebuildSmartModulesFromOutline({
      outlineId,
      sectionIds,
      autoPublishModulesWithContent: false,
    });
  } catch (err) {
    console.warn('[approveAndBuildOutline] smart modules skipped', err);
  }

  void logAiSpan('authoring.build', 'authoring', {
    outlineId: hashId(outlineId),
    patchCount: scheduledPatches.length,
    hasPriorCorpus: hasPriorCorpus || detail.hasPriorCorpus,
  });
  try {
    return await reviewOutlineDraft(built);
  } catch (err) {
    console.warn('[approveAndBuildOutline] review skipped', err);
    return built;
  }
}
