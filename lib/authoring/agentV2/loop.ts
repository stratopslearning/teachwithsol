/**
 * Authoring agent v2: one tool-calling loop (Claude-chat style).
 *
 * The model reads the conversation, calls read tools to look, write tools to
 * act, sees every result, and keeps going until it's done (max MAX_STEPS).
 * Impactful writes are parked for confirmation (pending.ts). The reply is the
 * model's short summary plus a "Changes made" list built from the action log,
 * so it can never claim an action that didn't happen.
 */
import type OpenAI from 'openai';

import { aiClientFor, resolveModel } from '@/lib/ai/gateway';
import { temperatureForModel } from '@/lib/ai/modelRouter';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { ApiError } from '@/lib/api/errors';
import { logAudit } from '@/lib/audit';
import { buildOutlineInventory } from '@/lib/authoring/agent/inventory';
import { stripLastActionMarker } from '@/lib/authoring/agent/lastAction';
import type { AuthoringAgentResult } from '@/lib/authoring/agent/run';
import { getOutlineDetail } from '@/lib/authoring/outlines';
import type { AuthUser } from '@/lib/getOrCreateUser';
import {
  AUTHORING_AGENT_PROMPT_VERSION,
  buildAgentSystemPrompt,
} from '@/lib/authoring/agentV2/prompt';
import {
  latestPending,
  stripPendingMarker,
  withPendingMarker,
  type PendingAction,
} from '@/lib/authoring/agentV2/pending';
import {
  agentToolDefs,
  runAgentTool,
  runConfirmed,
  stepLabel,
  type ActionEntry,
  type AgentContext,
} from '@/lib/authoring/agentV2/tools';

export const MAX_STEPS = 10;
/** Stop starting new steps after this long (route maxDuration is 300s). */
export const TIME_BUDGET_MS = 230_000;
const HISTORY_MESSAGES = 16;

export type AgentV2Result = AuthoringAgentResult & {
  /** Present when the reply is asking the professor to confirm something. */
  pendingAction?: { summaries: string[] };
};

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** "Changes made" / "Waiting for your confirmation" blocks from the log. */
export function changesBlock(log: ActionEntry[], pending: PendingAction | null): string {
  const parts: string[] = [];
  const done = log.filter((l) => l.ok);
  const failed = log.filter((l) => !l.ok);
  if (done.length) parts.push(['**Changes made**', ...done.map((l) => `- ${l.summary}`)].join('\n'));
  if (failed.length) parts.push(['**Not done**', ...failed.map((l) => `- ${l.summary}`)].join('\n'));
  if (pending?.calls.length) {
    parts.push(
      ['**Waiting for your confirmation**', ...pending.calls.map((c) => `- ${c.summary}`)].join('\n'),
    );
  }
  return parts.join('\n\n');
}

function historyForModel(history: Array<{ role: string; content: string }>): ChatMessage[] {
  return history.slice(-HISTORY_MESSAGES).flatMap((h): ChatMessage[] => {
    if (h.role !== 'user' && h.role !== 'assistant') return [];
    let content = stripLastActionMarker(stripPendingMarker(h.content));
    const pending = h.role === 'assistant' ? latestPending([h]) : null;
    if (pending) {
      content += `\n[Awaiting confirmation: ${pending.calls.map((c) => c.summary).join('; ')}]`;
    }
    return [{ role: h.role, content }];
  });
}

export async function runAuthoringAgentV2(
  user: AuthUser,
  opts: {
    outlineId: string;
    message: string;
    focusItemId?: string;
    materialIds?: string[];
    /** Confirm / Cancel buttons on a pending action. */
    confirmPending?: boolean;
    cancelPending?: boolean;
    /** Called with a short, specific label as each step starts (streamed to the UI). */
    onStep?: (label: string) => void;
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<AgentV2Result> {
  const step = (label: string) => {
    try {
      opts.onStep?.(label);
    } catch {
      /* a closed stream must not break the turn */
    }
  };
  const { assertCanManageOutline } = await import('@/lib/authoring/access');
  const outlineRow = await assertCanManageOutline(user, opts.outlineId);
  const message = opts.message.trim();
  if (!message) throw ApiError.badRequest('Message is required');
  if (!outlineRow.tenantId) throw ApiError.badRequest('Outline is missing tenant_id');

  const { fetchAuthoringMessagesForOutline, insertAuthoringMessagesDefiner, fetchCourseById } =
    await import('@/lib/db/entityScopedReads');
  // Latest messages, oldest first.
  const history = await fetchAuthoringMessagesForOutline(opts.outlineId, 20);
  const previousPending = latestPending(history);

  const detail = await getOutlineDetail(user, opts.outlineId);
  const ctx: AgentContext = {
    user,
    outlineId: opts.outlineId,
    courseId: outlineRow.courseId,
    message,
    focusItemId: opts.focusItemId,
    materialIds: opts.materialIds,
    audit,
    detail,
    inventory: buildOutlineInventory(detail, opts.focusItemId),
    log: [],
    pending: [],
    previousPending,
    confirmed: false,
    revisionTaken: false,
  };

  let modelText = '';
  let steps = 0;

  if (opts.cancelPending) {
    modelText = previousPending ? 'Cancelled — nothing was changed.' : 'There was nothing waiting to cancel.';
  } else if (opts.confirmPending) {
    if (!previousPending) {
      modelText = 'There’s nothing waiting for confirmation — it may have been replaced by a newer message.';
    } else {
      step(previousPending.calls.length === 1 ? previousPending.calls[0]!.summary : `Running ${previousPending.calls.length} confirmed changes`);
      await runConfirmed(ctx, previousPending);
      modelText = ctx.log.every((l) => l.ok) ? 'Done.' : 'Some of that didn’t go through — details below.';
    }
  } else {
    if (!process.env.OPENAI_API_KEY) throw ApiError.badRequest('OpenAI is not configured');
    const course = await fetchCourseById(outlineRow.courseId).catch(() => null);
    const focus = ctx.inventory.focus;
    const system = buildAgentSystemPrompt({
      outlineTitle: detail.title,
      courseName: (course as { name?: string | null } | null)?.name ?? null,
      today: new Date().toISOString().slice(0, 10),
      focusItem: focus ? { id: focus.id, title: focus.title, type: focus.type } : null,
      hasPending: Boolean(previousPending),
    });
    step('Reading the outline');
    const outlineNow = await runAgentTool(ctx, 'get_outline', '{}');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${system}\nPROMPT_VERSION=${AUTHORING_AGENT_PROMPT_VERSION}\n\n# Current outline (live; use these exact ids)\n${outlineNow}`,
      },
      ...historyForModel(history),
      { role: 'user', content: message },
    ];
    const openai = await aiClientFor('agent', { courseId: outlineRow.courseId }, { timeout: 90_000 });
    const model = resolveModel('agent').model;
    const temp = temperatureForModel(model, 0.2);
    const tools = agentToolDefs({ hasPending: Boolean(previousPending) });

    const started = Date.now();
    for (steps = 0; steps < MAX_STEPS; steps++) {
      const stepNo = steps;
      if (Date.now() - started > TIME_BUDGET_MS) {
        modelText = 'I stopped here to stay within the time limit — here’s what got done. Say “continue” to keep going.';
        break;
      }
      const completion = await openai.chat.completions.create({
        model,
        ...(temp != null ? { temperature: temp } : {}),
        messages,
        tools,
        tool_choice: 'auto',
        parallel_tool_calls: true,
      });
      const reply = completion.choices[0]?.message;
      if (!reply) break;
      messages.push(reply);
      const calls = reply.tool_calls ?? [];
      if (calls.length === 0) {
        modelText = reply.content?.trim() ?? '';
        break;
      }
      const fnCalls = calls.filter((c) => c.type === 'function');
      // Several new items in one step are written in parallel (each is a slow
      // generation); everything else runs in order so each sees the last result.
      const allCreates = fnCalls.length > 1 && fnCalls.every((c) => c.function.name === 'create_item');
      if (allCreates) {
        step(`Writing ${fnCalls.length} new items in parallel`);
      }
      const results = allCreates
        ? await Promise.all(fnCalls.map((c) => runAgentTool(ctx, c.function.name, c.function.arguments)))
        : null;
      for (const [i, call] of fnCalls.entries()) {
        if (!results) step(stepLabel(ctx, call.function.name, call.function.arguments));
        const result = results ? results[i]! : await runAgentTool(ctx, call.function.name, call.function.arguments);
        // One line per tool call (no content) so prod logs show what the agent did.
        console.info('[authoring-agent] tool', {
          step: stepNo,
          tool: call.function.name,
          error: result.startsWith('{"error"') ? result.slice(0, 300) : undefined,
          parked: result.includes('"needs_confirmation"') || undefined,
        });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    if (!modelText) {
      modelText =
        steps >= MAX_STEPS
          ? 'I stopped before finishing — that took more steps than I’m allowed in one turn. Here’s what got done so far.'
          : 'Done.';
    }
  }

  const newPending: PendingAction | null = ctx.pending.length
    ? { calls: ctx.pending, createdAt: new Date().toISOString() }
    : null;
  const block = changesBlock(ctx.log, newPending);
  const visible = block ? `${modelText}\n\n${block}` : modelText;
  const stored = withPendingMarker(visible, newPending);

  const outlineId = ctx.outlineOverride?.id ?? opts.outlineId;
  await insertAuthoringMessagesDefiner({
    outlineId,
    tenantId: outlineRow.tenantId,
    messages: [
      { role: 'user', content: message },
      { role: 'assistant', content: stored },
    ],
  });

  const ofKind = (k: ActionEntry['kind']) =>
    [...new Set(ctx.log.filter((l) => l.ok && l.kind === k).flatMap((l) => l.itemIds))];
  const patchedItemIds = [...new Set([...ofKind('patched'), ...ofKind('created')])];
  const publishedItemIds = ofKind('published');
  const releasedItemIds = ofKind('released');

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'professor.authoring.refine',
    targetType: 'course_outline',
    targetId: outlineId,
    tenantId: outlineRow.tenantId,
    metadata: {
      agent: 'v2',
      steps,
      confirmed: Boolean(opts.confirmPending),
      actions: ctx.log.map((l) => ({ tool: l.tool, ok: l.ok })),
      pending: newPending?.calls.map((c) => c.tool) ?? [],
    },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });
  void logAiSpan('authoring.agent.v2', 'authoring', {
    outlineId: hashId(outlineId),
    steps,
    actions: ctx.log.length,
    pending: newPending?.calls.length ?? 0,
  });

  const outline = ctx.outlineOverride ?? (await getOutlineDetail(user, outlineId));
  const failed = ctx.log.filter((l) => !l.ok && l.tool === 'publish_items');
  return {
    assistantMessage: visible,
    outline,
    patchedItemIds,
    publishedItemIds: publishedItemIds.length ? publishedItemIds : undefined,
    releasedItemIds: releasedItemIds.length ? releasedItemIds : undefined,
    publishFailed: failed.length
      ? failed.map((f) => ({ itemId: '', title: null, error: f.summary }))
      : undefined,
    pendingAction: newPending ? { summaries: newPending.calls.map((c) => c.summary) } : undefined,
  };
}
