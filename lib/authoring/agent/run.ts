import { z } from 'zod';

import type { OutlineItemBody } from '@/app/db/schema';
import { getAiClientForTask, resolveModel } from '@/lib/ai/gateway';
import { temperatureForModel } from '@/lib/ai/modelRouter';
import { loadCoursePromptContext } from '@/lib/ai/prompts/courseContext';
import { ApiError } from '@/lib/api/errors';
import { logAudit } from '@/lib/audit';
import {
  buildOutlineInventory,
  inventoryHumanSummary,
  inventoryPlannerSnapshot,
} from '@/lib/authoring/agent/inventory';
import {
  executeToolCall,
  formatToolResultsReply,
  plannerPlanSchema,
  resolveItemSelector,
  type PlannerPlan,
  type ToolCall,
  type ToolResult,
} from '@/lib/authoring/agent/tools';
import { AUTHORING_PROMPT_VERSION } from '@/lib/authoring/constants';
import { buildAuthoringMaterialsContext } from '@/lib/authoring/context';
import {
  isHollowQuizBody,
  mergeOutlineItemBody,
  restoreQuizContentFromFallback,
} from '@/lib/authoring/bodyMerge';
import {
  authoringCapabilitiesReply,
  authoringClarifyReply,
  authoringOutOfScopeReply,
} from '@/lib/authoring/agent/capabilities';
import { classifyAuthoringIntent } from '@/lib/authoring/agent/classify';
import {
  findLastActionInHistory,
  stripLastActionMarker,
  withLastActionMarker,
  type AuthoringLastAction,
} from '@/lib/authoring/agent/lastAction';
import type { AuthoringIntent } from '@/lib/authoring/agent/classify';
import { resolveAuthoringTargets } from '@/lib/authoring/agent/resolveTargets';
import {
  looksLikeEnsureLessonsRequest,
  looksLikeHelpOrCapabilitiesRequest,
  looksLikePublishRequest,
  looksLikeReleaseRequest,
  looksLikeRewriteRequest,
  looksLikeScheduleRequest,
  looksLikeSubmitRequest,
  parseQuantityLimit,
} from '@/lib/authoring/intent';
import {
  ensureInteractiveLessonsForOutline,
} from '@/lib/authoring/ensureLessons';
import {
  getOutlineDetail,
  type OutlineDetail,
} from '@/lib/authoring/outlines';
import { buildAuthoringAgentPlannerPrompt } from '@/lib/authoring/prompts';
import { authoringScheduleContext } from '@/lib/authoring/schedule';
import type { UserData } from '@/lib/getOrCreateUser';
import { hashId, logAiSpan } from '@/lib/ai/tracing';

type AuthUser = Pick<UserData, 'id' | 'clerkId'> & { platformStaff?: boolean | null };

export type AuthoringAgentResult = {
  assistantMessage: string;
  outline: OutlineDetail;
  patchedItemIds: string[];
  publishedItemIds?: string[];
  releasedItemIds?: string[];
  publishFailed?: Array<{
    itemId: string;
    title: string | null;
    error: string;
  }>;
};

const contentRefineSchema = z.object({
  assistantMessage: z.string().min(1),
  itemPatches: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        body: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .default([]),
});

const answerSchema = z.object({
  answer: z.string().min(1),
});

/**
 * Grounded authoring chat: plan tools → execute on server → reply from facts.
 */
export async function runAuthoringAgent(
  user: AuthUser,
  opts: {
    outlineId: string;
    message: string;
    focusItemId?: string;
    materialIds?: string[];
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<AuthoringAgentResult> {
  const { assertCanManageOutline } = await import('@/lib/authoring/access');
  const outlineRow = await assertCanManageOutline(user, opts.outlineId);
  const message = opts.message.trim();
  if (!message) throw ApiError.badRequest('Message is required');
  if (!outlineRow.tenantId) {
    throw ApiError.badRequest('Outline is missing tenant_id');
  }

  const detail = await getOutlineDetail(user, opts.outlineId);
  const inventory = buildOutlineInventory(detail, opts.focusItemId);

  const {
    fetchAuthoringMessagesForOutline,
    insertAuthoringMessagesDefiner,
    applyOutlineBuildDefiner,
  } = await import('@/lib/db/entityScopedReads');

  const prior = await fetchAuthoringMessagesForOutline(opts.outlineId, 12);
  const history = prior.slice().reverse();
  const lastAction = findLastActionInHistory(history);

  const intent = classifyAuthoringIntent(message, { inventory, lastAction });

  // Deterministic intents don't need the model.
  const needsModel =
    intent.kind === 'act' ||
    intent.kind === 'advise' ||
    intent.kind === 'status' ||
    intent.kind === 'repeat';
  if (needsModel && !process.env.OPENAI_API_KEY) {
    throw ApiError.badRequest('OpenAI is not configured');
  }

  const { text: materialsContext } = await buildAuthoringMaterialsContext(
    outlineRow.courseId,
    message,
    { materialIds: opts.materialIds },
  );

  async function persistAndReturn(optsPersist: {
    assistantMessage: string;
    tools: string[];
    lastAction?: AuthoringLastAction | null;
    patchedItemIds?: string[];
    publishedItemIds?: string[];
    releasedItemIds?: string[];
    publishFailed?: AuthoringAgentResult['publishFailed'];
    /** When ensure_lessons archives+replaces the outline. */
    outlineOverride?: OutlineDetail;
  }): Promise<AuthoringAgentResult> {
    const outlineId = optsPersist.outlineOverride?.id ?? opts.outlineId;
    const assistantMessage = withLastActionMarker(
      optsPersist.assistantMessage,
      optsPersist.lastAction ?? null,
    );
    await insertAuthoringMessagesDefiner({
      outlineId,
      tenantId: outlineRow.tenantId!,
      messages: [
        { role: 'user', content: message },
        { role: 'assistant', content: assistantMessage },
      ],
    });
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'professor.authoring.refine',
      targetType: 'course_outline',
      targetId: outlineId,
      tenantId: outlineRow.tenantId,
      metadata: {
        agentHarness: true,
        intent: intent.kind,
        tools: optsPersist.tools,
        publishedCount: optsPersist.publishedItemIds?.length ?? 0,
        releasedCount: optsPersist.releasedItemIds?.length ?? 0,
        patchedCount: optsPersist.patchedItemIds?.length ?? 0,
        focusItemId: opts.focusItemId ?? null,
      },
      ip: audit?.ip ?? null,
      userAgent: audit?.userAgent ?? null,
    });
    const updated =
      optsPersist.outlineOverride ??
      (await getOutlineDetail(user, outlineId));
    void logAiSpan('authoring.agent', 'authoring', {
      outlineId: hashId(outlineId),
      intent: intent.kind,
      tools: optsPersist.tools,
      patchedCount: optsPersist.patchedItemIds?.length ?? 0,
      publishedCount: optsPersist.publishedItemIds?.length ?? 0,
      releasedCount: optsPersist.releasedItemIds?.length ?? 0,
    });
    return {
      assistantMessage: stripForClient(assistantMessage),
      outline: updated,
      patchedItemIds: [...new Set(optsPersist.patchedItemIds ?? [])],
      publishedItemIds:
        (optsPersist.publishedItemIds?.length ?? 0) > 0
          ? [...new Set(optsPersist.publishedItemIds)]
          : undefined,
      releasedItemIds:
        (optsPersist.releasedItemIds?.length ?? 0) > 0
          ? [...new Set(optsPersist.releasedItemIds)]
          : undefined,
      publishFailed: optsPersist.publishFailed,
    };
  }

  if (intent.kind === 'help') {
    return persistAndReturn({
      assistantMessage: authoringCapabilitiesReply(inventory),
      tools: ['answer_question'],
    });
  }

  if (intent.kind === 'out_of_scope') {
    return persistAndReturn({
      assistantMessage: authoringOutOfScopeReply(intent.outOfScope ?? 'other'),
      tools: ['answer_question'],
    });
  }

  if (intent.kind === 'clarify') {
    const targets = resolveAuthoringTargets(message, inventory, {
      preferFocus: Boolean(inventory.focus),
    });

    // Scope/title answers like "all of them" resolve cleanly — resume the prior
    // refine instruction instead of asking a second clarifying question.
    const priorRefineInstruction = findPriorRefineInstruction(history, message);
    if (
      priorRefineInstruction &&
      targets.confidence >= 0.7 &&
      (targets.itemIds.length > 0 || targets.selector?.scope === 'all')
    ) {
      const plan: PlannerPlan = {
        tools: [
          {
            name: 'refine_items',
            args: {
              selector: targets.selector ?? { scope: 'all' },
              instruction: priorRefineInstruction,
            },
          },
        ],
      };
      return executePlanAndPersist({
        plan,
        user,
        opts,
        audit,
        outlineRow,
        detail,
        inventory,
        message: priorRefineInstruction,
        materialsContext,
        history,
        applyOutlineBuildDefiner,
        persistAndReturn,
      });
    }

    return persistAndReturn({
      assistantMessage: authoringClarifyReply(
        targets.question ??
          (priorRefineInstruction
            ? 'Which assignments should I refine — name them, or say “all of them”?'
            : 'What should I change — name an assignment, or say publish / release / refine / schedule?'),
      ),
      tools: ['answer_question'],
    });
  }

  if (intent.kind === 'advise') {
    const answer = await runAnswerTool({
      question: message,
      inventory,
      materialsContext,
      courseId: outlineRow.courseId,
      mode: 'advise',
    });
    return persistAndReturn({
      assistantMessage: answer,
      tools: ['answer_question'],
    });
  }

  if (intent.kind === 'status') {
    const answer = await runAnswerTool({
      question: message,
      inventory,
      materialsContext,
      courseId: outlineRow.courseId,
      mode: 'status',
    });
    return persistAndReturn({
      assistantMessage: answer,
      tools: ['answer_question'],
    });
  }

  if (intent.kind === 'undo') {
    const plan: PlannerPlan = {
      tools: [{ name: 'restore_revision', args: { latest: true } }],
    };
    return executePlanAndPersist({
      plan,
      user,
      opts,
      audit,
      outlineRow,
      detail,
      inventory,
      message,
      materialsContext,
      history,
      applyOutlineBuildDefiner,
      persistAndReturn,
    });
  }

  let plan: PlannerPlan;
  if (intent.kind === 'repeat' && lastAction) {
    plan = planFromLastAction(lastAction, message);
  } else {
    plan = normalizePlan(
      message,
      await planTools({
        message,
        inventory,
        history,
        materialsContext,
        courseId: outlineRow.courseId,
        intent,
      }),
    );
    plan = applyTargetResolution(message, inventory, plan);
    if (plan.tools.length === 1 && plan.tools[0]?.name === 'answer_question') {
      const q = plan.tools[0].args.question;
      // Target resolver converted the act into a clarify question.
      if (q && q !== message) {
        return persistAndReturn({
          assistantMessage: authoringClarifyReply(q),
          tools: ['answer_question'],
        });
      }
    }
  }

  return executePlanAndPersist({
    plan,
    user,
    opts,
    audit,
    outlineRow,
    detail,
    inventory,
    message,
    materialsContext,
    history,
    applyOutlineBuildDefiner,
    persistAndReturn,
  });
}

function stripForClient(content: string): string {
  return stripLastActionMarker(content);
}

/** Recover a refine instruction from recent history when the user only names scope. */
function findPriorRefineInstruction(
  history: Array<{ role: string; content: string }>,
  currentMessage: string,
): string | null {
  const current = currentMessage.trim().toLowerCase();
  // Pure scope / deictic answers should not be treated as the refine instruction.
  if (
    /^(all( of them)?|every(thing)?|the whole (outline|course)|entire outline|those|these|both|all quizzes|all items)[!?.]*$/i.test(
      current,
    )
  ) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const row = history[i];
      if (!row || row.role !== 'user') continue;
      const text = stripForClient(row.content).trim();
      if (!text || text.toLowerCase() === current) continue;
      if (
        looksLikeRewriteRequest(text) ||
        /\b(make|improve|rewrite|fix|change|better|stronger|clearer)\b/i.test(
          text,
        )
      ) {
        return text;
      }
    }
    return null;
  }
  if (looksLikeRewriteRequest(currentMessage)) return currentMessage;
  return null;
}

function planFromLastAction(
  last: AuthoringLastAction,
  message: string,
): PlannerPlan {
  const tools: ToolCall[] = [];
  const selector =
    last.itemIds.length > 0
      ? { scope: 'ids' as const, itemIds: last.itemIds }
      : { scope: 'all' as const };
  for (const name of last.tools) {
    if (name === 'publish_items') {
      tools.push({ name: 'publish_items', args: { selector } });
    } else if (name === 'release_items') {
      tools.push({ name: 'release_items', args: { selector } });
    } else if (name === 'schedule_items') {
      tools.push({
        name: 'schedule_items',
        args: { selector, schedule: {} },
      });
    } else if (name === 'refine_items') {
      tools.push({
        name: 'refine_items',
        args: {
          selector,
          instruction: last.instruction || message,
        },
      });
    }
  }
  if (tools.length === 0) {
    return {
      tools: [
        {
          name: 'answer_question',
          args: {
            question:
              'I don’t have a previous action to repeat. Tell me what to publish, release, refine, or schedule.',
            mode: 'decline',
          },
        },
      ],
    };
  }
  return { tools };
}

/** If mutating tools lack tight selectors, resolve from the prompt or ask. */
export function applyTargetResolution(
  message: string,
  inventory: ReturnType<typeof buildOutlineInventory>,
  plan: PlannerPlan,
): PlannerPlan {
  const mutating = plan.tools.filter((t) =>
    (
      [
        'publish_items',
        'release_items',
        'schedule_items',
        'refine_items',
      ] as string[]
    ).includes(t.name),
  );
  if (mutating.length === 0) return plan;

  const needsResolve = mutating.some((t) => {
    if (
      t.name === 'publish_items' ||
      t.name === 'release_items' ||
      t.name === 'schedule_items' ||
      t.name === 'refine_items'
    ) {
      const sel = t.args.selector;
      if (sel.scope === 'ids' && (sel.itemIds?.length ?? 0) > 0) return false;
      if (sel.scope === 'first' || sel.scope === 'last') return false;
      if (sel.scope === 'all' && /\b(all|every|entire|whole)\b/i.test(message)) {
        return false;
      }
      if (sel.scope === 'focus' && inventory.focus) return false;
      // Broad refine/publish without quantity → resolve
      return sel.scope === 'all' || sel.scope === 'focus';
    }
    return false;
  });

  if (!needsResolve) return plan;

  const resolved = resolveAuthoringTargets(message, inventory, {
    preferFocus: Boolean(inventory.focus),
  });
  if (resolved.confidence < 0.7 || resolved.itemIds.length === 0) {
    return {
      tools: [
        {
          name: 'answer_question',
          args: {
            question:
              resolved.question ??
              'Which assignment should I change? Name it or open it in the outline.',
            mode: 'decline',
          },
        },
      ],
    };
  }

  return {
    tools: plan.tools.map((t) => {
      if (
        t.name === 'publish_items' ||
        t.name === 'release_items' ||
        t.name === 'schedule_items' ||
        t.name === 'refine_items'
      ) {
        return {
          ...t,
          args: {
            ...t.args,
            selector: resolved.selector,
          },
        } as ToolCall;
      }
      return t;
    }),
  };
}

async function executePlanAndPersist(ctx: {
  plan: PlannerPlan;
  user: AuthUser;
  opts: {
    outlineId: string;
    message: string;
    focusItemId?: string;
    materialIds?: string[];
  };
  audit?: { ip?: string | null; userAgent?: string | null };
  outlineRow: { courseId: string; tenantId: string | null };
  detail: OutlineDetail;
  inventory: ReturnType<typeof buildOutlineInventory>;
  message: string;
  materialsContext: string;
  history: Array<{ role: string; content: string }>;
  applyOutlineBuildDefiner: (payload: {
    outlineId: string;
    patches: Array<{ itemId: string; title?: string; body: OutlineItemBody }>;
    hasPriorCorpus: boolean;
  }) => Promise<unknown>;
  persistAndReturn: (opts: {
    assistantMessage: string;
    tools: string[];
    lastAction?: AuthoringLastAction | null;
    patchedItemIds?: string[];
    publishedItemIds?: string[];
    releasedItemIds?: string[];
    publishFailed?: AuthoringAgentResult['publishFailed'];
    outlineOverride?: OutlineDetail;
  }) => Promise<AuthoringAgentResult>;
}): Promise<AuthoringAgentResult> {
  let { detail, inventory } = ctx;
  const results: ToolResult[] = [];
  const patchedItemIds: string[] = [];
  const publishedItemIds: string[] = [];
  const releasedItemIds: string[] = [];
  const publishFailed: NonNullable<AuthoringAgentResult['publishFailed']> = [];
  let refineInstruction: string | undefined;

  let outlineOverride: OutlineDetail | undefined;

  for (const call of ctx.plan.tools) {
    if (
      call.name === 'release_items' ||
      call.name === 'publish_items' ||
      call.name === 'schedule_items' ||
      call.name === 'refine_items' ||
      call.name === 'restore_revision' ||
      call.name === 'ensure_interactive_lessons'
    ) {
      const activeId = outlineOverride?.id ?? ctx.opts.outlineId;
      detail = await getOutlineDetail(ctx.user, activeId);
      inventory = buildOutlineInventory(detail, ctx.opts.focusItemId);
    }

    if (call.name === 'ensure_interactive_lessons') {
      try {
        const ensured = await ensureInteractiveLessonsForOutline(
          ctx.user,
          outlineOverride?.id ?? ctx.opts.outlineId,
          ctx.audit,
        );
        outlineOverride = ensured.outline;
        detail = ensured.outline;
        inventory = buildOutlineInventory(detail, ctx.opts.focusItemId);
        const lessonItems = detail.modules.flatMap((mod) =>
          mod.items.filter((i) => i.type === 'LESSON'),
        );
        results.push({
          name: 'ensure_interactive_lessons',
          ok: true,
          lessonsAdded: ensured.lessonsAdded,
          lessonsBuilt: ensured.lessonsBuilt,
          alreadyComplete: ensured.alreadyComplete,
          outlineId: detail.id,
          patched: lessonItems.map((i) => ({ id: i.id, title: i.title })),
        });
        patchedItemIds.push(...lessonItems.map((i) => i.id));
      } catch (err) {
        console.error('[authoring agent] ensure_interactive_lessons failed', err);
        results.push({
          name: 'ensure_interactive_lessons',
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Couldn’t add interactive lessons',
        });
      }
      continue;
    }

    if (call.name === 'refine_items') {
      refineInstruction = call.args.instruction;
      const refineResult = await runContentRefineTool({
        user: ctx.user,
        outlineId: outlineOverride?.id ?? ctx.opts.outlineId,
        detail,
        inventory,
        call,
        message: ctx.message,
        materialsContext: ctx.materialsContext,
        history: ctx.history,
        courseId: ctx.outlineRow.courseId,
        applyOutlineBuildDefiner: ctx.applyOutlineBuildDefiner,
        hasPriorCorpus: detail.hasPriorCorpus,
      });
      results.push(refineResult.result);
      patchedItemIds.push(...refineResult.patchedItemIds);
      continue;
    }

    if (call.name === 'answer_question') {
      const question = call.args.question || ctx.message;
      const mode = call.args.mode;
      let answer: string;
      if (mode === 'help' || looksLikeHelpOrCapabilitiesRequest(question)) {
        answer = authoringCapabilitiesReply(inventory);
      } else if (mode === 'decline') {
        answer = question;
      } else {
        answer = await runAnswerTool({
          question,
          inventory,
          materialsContext: ctx.materialsContext,
          courseId: ctx.outlineRow.courseId,
          mode: mode === 'advise' ? 'advise' : 'status',
        });
      }
      results.push({ name: 'answer_question', ok: true, answer });
      continue;
    }

    let toolCall = call;
    if (call.name === 'schedule_items') {
      toolCall = await enrichScheduleCall(
        call,
        ctx.message,
        ctx.outlineRow.courseId,
      );
    }

    const executed = await executeToolCall({
      user: ctx.user,
      outlineId: ctx.opts.outlineId,
      detail,
      inventory,
      call: toolCall,
      audit: ctx.audit,
      materialsContext: ctx.materialsContext,
    });
    results.push(executed);

    if (executed.ok && executed.name === 'publish_items') {
      publishedItemIds.push(...executed.published.map((p) => p.id));
      for (const f of executed.failed) {
        publishFailed.push({
          itemId: f.id,
          title: f.title,
          error: f.error,
        });
      }
    }
    if (executed.ok && executed.name === 'release_items') {
      releasedItemIds.push(...executed.released.map((p) => p.id));
    }
    if (executed.ok && executed.name === 'schedule_items') {
      patchedItemIds.push(...executed.patched.map((p) => p.id));
    }
  }

  const assistantMessage = formatToolResultsReply(results);
  const actionItemIds = [
    ...new Set([
      ...patchedItemIds,
      ...publishedItemIds,
      ...releasedItemIds,
    ]),
  ];
  const lastAction: AuthoringLastAction | null =
    actionItemIds.length > 0
      ? {
          tools: ctx.plan.tools
            .map((t) => t.name)
            .filter((n) => n !== 'answer_question' && n !== 'list_outline'),
          itemIds: actionItemIds,
          instruction: refineInstruction,
          at: new Date().toISOString(),
        }
      : null;

  return ctx.persistAndReturn({
    assistantMessage,
    tools: ctx.plan.tools.map((t) => t.name),
    lastAction,
    patchedItemIds,
    publishedItemIds,
    releasedItemIds,
    publishFailed: publishFailed.length > 0 ? publishFailed : undefined,
    outlineOverride,
  });
}

async function planTools(opts: {
  message: string;
  inventory: ReturnType<typeof buildOutlineInventory>;
  history: Array<{ role: string; content: string }>;
  materialsContext: string;
  courseId: string;
  intent?: AuthoringIntent;
}): Promise<PlannerPlan> {
  // Compound verb plans can be built deterministically without the LLM.
  if (opts.intent?.kind === 'act' && opts.intent.verbs?.length) {
    const fromIntent = planFromIntentVerbs(opts.message, opts.inventory, opts.intent);
    if (fromIntent) return fromIntent;
  }

  const openai = getAiClientForTask('refine', { timeout: 45_000 });
  const model = resolveModel('refine').model;
  const courseCtx = await loadCoursePromptContext(opts.courseId);
  const system = `${buildAuthoringAgentPlannerPrompt(courseCtx)}\nPROMPT_VERSION=${AUTHORING_PROMPT_VERSION}`;

  const messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Schedule context: ${authoringScheduleContext()}\n\nGrounded inventory (only these ids exist):\n${inventoryPlannerSnapshot(opts.inventory)}\n\nMaterials:\n${opts.materialsContext || '(none)'}`,
    },
    ...opts.history.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: stripLastActionMarker(h.content),
    })),
    { role: 'user', content: opts.message },
  ];

  try {
    const temp = temperatureForModel(model, 0.1);
    const completion = await openai.chat.completions.create({
      model,
      ...(temp != null ? { temperature: temp } : {}),
      response_format: { type: 'json_object' },
      messages,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('empty plan');
    const raw = JSON.parse(content) as unknown;
    const parsed = plannerPlanSchema.safeParse(raw);
    if (!parsed.success) throw new Error(parsed.error.message);
    return normalizePlan(opts.message, parsed.data);
  } catch (err) {
    console.error('[authoring agent] plan failed; falling back', err);
    return fallbackPlan(opts.message, opts.inventory);
  }
}

function planFromIntentVerbs(
  message: string,
  inventory: ReturnType<typeof buildOutlineInventory>,
  intent: AuthoringIntent,
): PlannerPlan | null {
  const verbs = intent.verbs ?? [];
  if (verbs.length === 0) return null;
  const quantity = parseQuantityLimit(message);
  const scope =
    quantity == null
      ? inventory.focus
        ? ('focus' as const)
        : ('all' as const)
      : quantity.fromEnd
        ? ('last' as const)
        : ('first' as const);
  const count = quantity?.count;
  const m = message.toLowerCase();
  const types = /\bquiz/.test(m)
    ? (['QUIZ'] as const)
    : /\bdiscussion/.test(m)
      ? (['DISCUSSION'] as const)
      : undefined;
  const tools: ToolCall[] = [];
  for (const verb of verbs) {
    if (verb === 'publish') {
      tools.push({
        name: 'publish_items',
        args: {
          selector: {
            scope,
            count,
            types: types ? [...types] : ['QUIZ'],
            published: false,
          },
        },
      });
    } else if (verb === 'release') {
      tools.push({
        name: 'release_items',
        args: {
          selector: {
            scope,
            count,
            types: types ? [...types] : ['QUIZ'],
            published: true,
          },
        },
      });
    } else if (verb === 'schedule') {
      tools.push({
        name: 'schedule_items',
        args: {
          selector: {
            scope,
            count,
            types: types ? [...types] : undefined,
          },
          schedule: {},
        },
      });
    } else if (verb === 'refine') {
      tools.push({
        name: 'refine_items',
        args: {
          selector: {
            scope,
            count,
            types: types ? [...types] : undefined,
          },
          instruction: message,
        },
      });
    } else if (verb === 'ensure_lessons') {
      tools.push({ name: 'ensure_interactive_lessons', args: {} });
    } else if (verb === 'restore') {
      tools.push({ name: 'restore_revision', args: { latest: true } });
    }
  }
  return tools.length > 0 ? { tools } : null;
}

/** Force help/meta prompts onto answer_question only (no inventory dump). */
export function normalizePlan(
  message: string,
  plan: PlannerPlan,
): PlannerPlan {
  if (!looksLikeHelpOrCapabilitiesRequest(message)) return plan;
  return {
    tools: [
      {
        name: 'answer_question',
        args: { question: message },
      },
    ],
  };
}

/** Deterministic fallback when the planner JSON is invalid. */
export function fallbackPlan(
  message: string,
  inventory: ReturnType<typeof buildOutlineInventory>,
): PlannerPlan {
  if (looksLikeHelpOrCapabilitiesRequest(message)) {
    return {
      tools: [
        {
          name: 'answer_question',
          args: { question: message },
        },
      ],
    };
  }

  const m = message.toLowerCase();
  const quantity = parseQuantityLimit(message);
  const scope =
    quantity == null
      ? ('all' as const)
      : quantity.fromEnd
        ? ('last' as const)
        : ('first' as const);
  const count = quantity?.count;
  const types = /\bquiz/.test(m)
    ? (['QUIZ'] as const)
    : /\bdiscussion/.test(m)
      ? (['DISCUSSION'] as const)
      : undefined;

  let wantsPublish = looksLikePublishRequest(message);
  let wantsRelease = looksLikeReleaseRequest(message);
  if (looksLikeSubmitRequest(message) && !wantsRelease) {
    const unpublished = inventory.items.filter((i) => !i.published);
    const typed = types
      ? unpublished.filter((i) => (types as readonly string[]).includes(i.type))
      : unpublished;
    if (typed.length === 0) {
      wantsPublish = false;
      wantsRelease = true;
    }
  }

  if ((wantsPublish || wantsRelease) && !looksLikeRewriteRequest(message)) {
    const tools: ToolCall[] = [];
    if (wantsPublish) {
      tools.push({
        name: 'publish_items',
        args: {
          selector: {
            scope,
            count,
            types: types ? [...types] : ['QUIZ'],
            published: false,
          },
        },
      });
    }
    if (wantsRelease) {
      tools.push({
        name: 'release_items',
        args: {
          selector: {
            scope,
            count,
            types: types ? [...types] : ['QUIZ'],
            published: true,
          },
        },
      });
    }
    return { tools };
  }

  if (looksLikeScheduleRequest(message) && !looksLikeRewriteRequest(message)) {
    return {
      tools: [
        {
          name: 'schedule_items',
          args: {
            selector: {
              scope: inventory.focus ? 'focus' : scope,
              count,
              types: types ? [...types] : undefined,
            },
            schedule: {},
          },
        },
      ],
    };
  }

  if (looksLikeEnsureLessonsRequest(message)) {
    return { tools: [{ name: 'ensure_interactive_lessons', args: {} }] };
  }

  if (
    (inventory.counts.byType.LESSON ?? 0) === 0 &&
    inventory.counts.total > 0 &&
    /\b(make|improve)\b.{0,40}\boutline\b/i.test(message)
  ) {
    return { tools: [{ name: 'ensure_interactive_lessons', args: {} }] };
  }

  if (looksLikeRewriteRequest(message)) {
    return {
      tools: [
        {
          name: 'refine_items',
          args: {
            selector: {
              scope: inventory.focus && !quantity ? 'focus' : scope,
              count,
              types: types ? [...types] : undefined,
            },
            instruction: message,
          },
        },
      ],
    };
  }

  if (
    /\?$/.test(message.trim()) ||
    /^(what|which|how many|list|show|status)\b/i.test(message.trim())
  ) {
    // Status / inventory questions only — help already returned above.
    return {
      tools: [
        { name: 'list_outline', args: {} },
        {
          name: 'answer_question',
          args: { question: message },
        },
      ],
    };
  }

  // Never default to refine-all — ask instead.
  return {
    tools: [
      {
        name: 'answer_question',
        args: {
          question:
            'What should I do — refine content, publish drafts, release to students, or update schedule? Name an assignment if you can.',
          mode: 'decline',
        },
      },
    ],
  };
}

async function runContentRefineTool(opts: {
  user: AuthUser;
  outlineId: string;
  detail: OutlineDetail;
  inventory: ReturnType<typeof buildOutlineInventory>;
  call: Extract<ToolCall, { name: 'refine_items' }>;
  message: string;
  materialsContext: string;
  history: Array<{ role: string; content: string }>;
  courseId: string;
  applyOutlineBuildDefiner: (payload: {
    outlineId: string;
    patches: Array<{ itemId: string; title?: string; body: OutlineItemBody }>;
    hasPriorCorpus: boolean;
  }) => Promise<unknown>;
  hasPriorCorpus: boolean;
}): Promise<{ result: ToolResult; patchedItemIds: string[] }> {
  const resolved = resolveItemSelector(
    opts.inventory,
    opts.call.args.selector,
  );
  if (resolved.length === 0) {
    return {
      result: {
        name: 'refine_items',
        ok: true,
        patched: [],
        resolvedIds: [],
      },
      patchedItemIds: [],
    };
  }

  const targetIds = new Set(resolved.map((r) => r.id));
  const slim = opts.detail.modules.map((m) => ({
    id: m.id,
    title: m.title,
    items: m.items
      .filter((i) => targetIds.has(i.id))
      .map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        status: i.status,
        body: i.body,
      })),
  }));

  const { buildRefineSystemPrompt } = await import('@/lib/authoring/prompts');
  const courseCtx = await loadCoursePromptContext(opts.courseId);
  const openai = getAiClientForTask('refine', { timeout: 60_000 });
  const model = resolveModel('refine').model;
  const system = `${buildRefineSystemPrompt(courseCtx)}\nPROMPT_VERSION=${AUTHORING_PROMPT_VERSION}\nOnly patch the provided target items. Do not claim publish/release.`;

  let parsed: z.infer<typeof contentRefineSchema>;
  try {
    const temp = temperatureForModel(model, 0.3);
    const completion = await openai.chat.completions.create({
      model,
      ...(temp != null ? { temperature: temp } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Schedule context: ${authoringScheduleContext()}\n\nTarget items JSON:\n${JSON.stringify(slim)}\n\nMaterials:\n${opts.materialsContext || '(none)'}\n\nInstruction: ${opts.call.args.instruction}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('empty refine');
    const result = contentRefineSchema.safeParse(JSON.parse(content));
    if (!result.success) throw new Error(result.error.message);
    parsed = result.data;
  } catch (err) {
    console.error('[authoring agent] refine_items failed', err);
    return {
      result: {
        name: 'refine_items',
        ok: false,
        error: 'Failed to refine content',
      },
      patchedItemIds: [],
    };
  }

  const patches: Array<{
    itemId: string;
    title?: string;
    body: OutlineItemBody;
  }> = [];
  const patched: Array<{ id: string; title: string }> = [];

  for (const patch of parsed.itemPatches) {
    if (!targetIds.has(patch.itemId)) continue;
    const existing = opts.detail.modules
      .flatMap((m) => m.items)
      .find((i) => i.id === patch.itemId);
    if (!existing) continue;
    const rawPatch = (patch.body ?? {}) as OutlineItemBody;
    let nextBody = mergeOutlineItemBody(existing.body ?? {}, rawPatch);
    if (
      existing.type === 'QUIZ' &&
      !isHollowQuizBody(existing.body) &&
      isHollowQuizBody(nextBody)
    ) {
      nextBody = restoreQuizContentFromFallback(nextBody, existing.body);
    }
    if (
      existing.type === 'QUIZ' &&
      isHollowQuizBody(nextBody) &&
      existing.faithfulBody &&
      !isHollowQuizBody(existing.faithfulBody)
    ) {
      nextBody = restoreQuizContentFromFallback(
        nextBody,
        existing.faithfulBody,
      );
    }
    patches.push({
      itemId: patch.itemId,
      ...(patch.title ? { title: patch.title.trim() } : {}),
      body: nextBody,
    });
    patched.push({ id: existing.id, title: patch.title ?? existing.title });
  }

  if (patches.length > 0) {
    const { createAuthoringRevision } = await import(
      '@/lib/authoring/revisions'
    );
    await createAuthoringRevision(
      opts.user,
      opts.outlineId,
      `Before refine: ${opts.message.slice(0, 80)}`,
    );
    await opts.applyOutlineBuildDefiner({
      outlineId: opts.outlineId,
      patches,
      hasPriorCorpus: opts.hasPriorCorpus,
    });
  }

  return {
    result: {
      name: 'refine_items',
      ok: true,
      patched,
      resolvedIds: resolved.map((r) => r.id),
      assistantNote: parsed.assistantMessage,
    },
    patchedItemIds: patched.map((p) => p.id),
  };
}

async function enrichScheduleCall(
  call: Extract<ToolCall, { name: 'schedule_items' }>,
  message: string,
  courseId: string,
): Promise<Extract<ToolCall, { name: 'schedule_items' }>> {
  const schedule = call.args.schedule ?? {};
  const hasAny =
    schedule.maxAttempts != null ||
    schedule.timeLimit !== undefined ||
    schedule.passingScore != null ||
    Boolean(schedule.startDate) ||
    Boolean(schedule.endDate);
  if (hasAny) return call;

  const openai = getAiClientForTask('refine', { timeout: 20_000 });
  const model = resolveModel('refine').model;
  try {
    const temp = temperatureForModel(model, 0.1);
    const completion = await openai.chat.completions.create({
      model,
      ...(temp != null ? { temperature: temp } : {}),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extract quiz schedule fields from the professor request. Return JSON only: { "maxAttempts"?: number, "timeLimit"?: number|null, "passingScore"?: number, "startDate"?: ISO-8601, "endDate"?: ISO-8601 }. Anchor to today: ${authoringScheduleContext()}. Course id context: ${courseId}.`,
        },
        { role: 'user', content: message },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return call;
    const parsed = z
      .object({
        maxAttempts: z.number().int().min(1).max(20).optional(),
        timeLimit: z.number().int().min(1).max(600).nullable().optional(),
        passingScore: z.number().int().min(0).max(100).optional(),
        startDate: z.string().min(1).optional(),
        endDate: z.string().min(1).optional(),
      })
      .safeParse(JSON.parse(content));
    if (!parsed.success) return call;
    return {
      name: 'schedule_items',
      args: {
        selector: call.args.selector,
        schedule: parsed.data,
      },
    };
  } catch {
    return call;
  }
}

async function runAnswerTool(opts: {
  question: string;
  inventory: ReturnType<typeof buildOutlineInventory>;
  materialsContext: string;
  courseId: string;
  mode?: 'status' | 'advise';
}): Promise<string> {
  const mode = opts.mode ?? 'status';
  if (mode === 'status' && /\b(list|show)\b.{0,24}\b(all|everything|outline|quizzes|items)\b/i.test(opts.question)) {
    return inventoryHumanSummary(opts.inventory);
  }

  const openai = getAiClientForTask('refine', { timeout: 30_000 });
  const model = resolveModel('refine').model;
  const courseCtx = await loadCoursePromptContext(opts.courseId);
  const system =
    mode === 'advise'
      ? `You are SOL's instructional coach for ${courseCtx.courseTitle ?? 'this course'}.
Give practical teaching advice grounded in the outline inventory and materials.
Do not claim you published/released/changed anything. Suggest concrete next chat commands when useful.
Keep it concise (under ~180 words). Return JSON { "answer": string }.`
      : `You answer professor questions about their SOL course outline for ${courseCtx.courseTitle ?? 'this course'}.
Use ONLY the inventory facts for counts, titles, and publish/release state — never invent side effects.
Answer in a short, natural paragraph (or a tight bullet list). Do NOT paste the full inventory unless they asked to list everything.
Return JSON { "answer": string }.`;

  try {
    const temp = temperatureForModel(model, mode === 'advise' ? 0.4 : 0.2);
    const completion = await openai.chat.completions.create({
      model,
      ...(temp != null ? { temperature: temp } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Inventory:\n${inventoryHumanSummary(opts.inventory)}\n\nMaterials:\n${opts.materialsContext || '(none)'}\n\nQuestion: ${opts.question}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return mode === 'advise'
        ? 'I could not form advice from the current materials. Try asking about a specific quiz or module.'
        : 'I could not answer from the current outline. Ask about counts, publish status, or a specific assignment.';
    }
    const parsed = answerSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return mode === 'advise'
        ? 'I could not form advice from the current materials. Try asking about a specific quiz or module.'
        : 'I could not answer from the current outline. Ask about counts, publish status, or a specific assignment.';
    }
    return parsed.data.answer;
  } catch {
    return mode === 'advise'
      ? 'I could not form advice from the current materials. Try asking about a specific quiz or module.'
      : 'I could not answer from the current outline. Ask about counts, publish status, or a specific assignment.';
  }
}
