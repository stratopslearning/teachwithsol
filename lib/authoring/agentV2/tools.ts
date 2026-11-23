/**
 * Tools the authoring agent can call. Read tools run freely; write tools are
 * checked against needsConfirmation() and either run (and land in the action
 * log) or are parked as a pending action for the professor to confirm.
 *
 * Every result returned to the model is JSON. The action log, not the
 * model's prose, is the source of truth for "what changed".
 */
import type OpenAI from 'openai';
import { and, eq, isNull } from 'drizzle-orm';

import { courseOfferings, sections, type OutlineItemBody } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { buildAuthoringMaterialsContext } from '@/lib/authoring/context';
import { buildOutlineInventory, type OutlineInventory } from '@/lib/authoring/agent/inventory';
import { executeToolCall } from '@/lib/authoring/agent/tools';
import {
  createOutlineItem,
  createOutlineModule,
  deleteOutlineItem,
  getOutlineDetail,
  type OutlineDetail,
  type OutlineItemSummary,
} from '@/lib/authoring/outlines';
import { withCourseTenant } from '@/lib/authoring/tenant';
import type { AuthUser } from '@/lib/getOrCreateUser';
import { generateItemBody } from '@/lib/authoring/agentV2/generateItem';
import {
  needsConfirmation,
  type PendingAction,
  type PendingCall,
  type WriteToolName,
  WRITE_TOOLS,
} from '@/lib/authoring/agentV2/pending';

export type ActionEntry = {
  tool: WriteToolName;
  ok: boolean;
  /** Human line for the "Changes made" list. */
  summary: string;
  itemIds: string[];
  kind?: 'patched' | 'published' | 'released' | 'created';
};

export type AgentContext = {
  user: AuthUser;
  outlineId: string;
  courseId: string;
  message: string;
  focusItemId?: string;
  materialIds?: string[];
  audit?: { ip?: string | null; userAgent?: string | null };
  detail: OutlineDetail;
  inventory: OutlineInventory;
  /** Completed writes this turn. */
  log: ActionEntry[];
  /** Writes parked for confirmation this turn. */
  pending: PendingCall[];
  /** Pending action from the previous turn (confirm_pending_action). */
  previousPending: PendingAction | null;
  /** True while running confirmed calls: skips the confirmation gate. */
  confirmed: boolean;
  revisionTaken: boolean;
  /** Outline replaced by add_interactive_lessons. */
  outlineOverride?: OutlineDetail;
};

type ToolDef = OpenAI.Chat.Completions.ChatCompletionTool;

const ids = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 40 } as const;

function fn(name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): ToolDef {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required, additionalProperties: false },
    },
  };
}

export function agentToolDefs(opts: { hasPending: boolean }): ToolDef[] {
  const defs: ToolDef[] = [
    fn('get_outline', 'List modules and items in this outline with ids, types, titles, publish/release state, question counts and schedules. Call this before referring to items.'),
    fn('get_item', 'Full content of one item: questions, options, answers, rubrics, instructions, schedule.', { item_id: { type: 'string' } }, ['item_id']),
    fn('search_materials', "Search the course's uploaded materials. Returns the most relevant passages with their source titles.", { query: { type: 'string' } }, ['query']),
    fn('get_course_calendar', "Today's date and the course's real section and term dates. Call before setting schedules."),
    fn('get_publish_checks', 'Problems to fix before publishing or releasing (past due dates, missing dates, duplicates, unreleased items).'),
    fn('list_revisions', 'Saved snapshots of the outline that restore_revision can roll back to.'),
    fn('edit_items', 'Rewrite or adjust existing items: wording, difficulty, rename, add/remove/replace questions, rubrics, instructions. One instruction applied to the listed items.', {
      item_ids: ids,
      instruction: { type: 'string', description: 'Exactly what to change, in the professor’s terms.' },
    }, ['item_ids', 'instruction']),
    fn('create_item', 'Create a NEW quiz or discussion in a module, written from the course materials. Use this for "make more quizzes" or "add a discussion".', {
      module_id: { type: 'string' },
      type: { type: 'string', enum: ['QUIZ', 'DISCUSSION'] },
      title: { type: 'string' },
      brief: { type: 'string', description: 'Topic, scope and any requirements from the professor.' },
      question_count: { type: 'integer', minimum: 1, maximum: 50, description: 'QUIZ only.' },
      difficulty: { type: 'string', enum: ['intro', 'intermediate', 'advanced'] },
    }, ['module_id', 'type', 'title', 'brief']),
    fn('create_module', 'Add a new module at the end of the outline.', {
      title: { type: 'string' },
      summary: { type: 'string' },
    }, ['title']),
    fn('delete_item', 'Delete an unpublished item from the outline.', { item_id: { type: 'string' } }, ['item_id']),
    fn('set_schedule', 'Set open/due dates (ISO 8601 with time and timezone offset), time limit, attempts and passing score on quizzes. Only include fields to change.', {
      item_ids: ids,
      start_date: { type: 'string' },
      due_date: { type: 'string' },
      time_limit_minutes: { type: 'integer', minimum: 1, maximum: 600 },
      max_attempts: { type: 'integer', minimum: 1, maximum: 20 },
      passing_score: { type: 'integer', minimum: 0, maximum: 100 },
    }, ['item_ids']),
    fn('publish_items', 'Publish items as inactive assignment drafts (students cannot see them yet).', { item_ids: ids }, ['item_ids']),
    fn('release_items', 'Make published items visible to students.', { item_ids: ids }, ['item_ids']),
    fn('restore_revision', 'Undo by restoring a saved revision (latest if no id).', { revision_id: { type: 'string' } }),
    fn('add_interactive_lessons', 'Give every module an interactive reading chapter with practice checks.'),
  ];
  if (opts.hasPending) {
    defs.push(fn('confirm_pending_action', 'Run the action the professor was asked to confirm in the last message. Only call when they clearly agreed.'));
  }
  return defs;
}

function findItem(ctx: AgentContext, id: string): OutlineItemSummary | null {
  for (const m of ctx.detail.modules) {
    const hit = m.items.find((i) => i.id === id);
    if (hit) return hit;
  }
  return null;
}

function requireItems(ctx: AgentContext, itemIds: unknown): OutlineItemSummary[] {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new Error('item_ids is required');
  }
  const unknown = itemIds.filter((id) => typeof id !== 'string' || !findItem(ctx, id));
  if (unknown.length > 0) {
    throw new Error(`Unknown item id(s): ${unknown.join(', ')}. Call get_outline for valid ids.`);
  }
  return [...new Set(itemIds as string[])].map((id) => findItem(ctx, id)!);
}

function isPublished(i: OutlineItemSummary): boolean {
  return Boolean(i.publishedQuizId || i.publishedChatbotId || i.publishedLessonId || i.publishedInteractiveId);
}

function titles(items: Array<{ title: string }>, max = 5): string {
  const shown = items.slice(0, max).map((i) => `“${i.title}”`).join(', ');
  return items.length > max ? `${shown} +${items.length - max} more` : shown;
}

async function refresh(ctx: AgentContext): Promise<void> {
  const id = ctx.outlineOverride?.id ?? ctx.outlineId;
  ctx.detail = await getOutlineDetail(ctx.user, id);
  ctx.inventory = buildOutlineInventory(ctx.detail, ctx.focusItemId);
}

const revisionInFlight = new WeakMap<AgentContext, Promise<void>>();

/** One undo point per turn, even when creates run in parallel. */
async function ensureRevision(ctx: AgentContext): Promise<void> {
  if (ctx.revisionTaken) return;
  let p = revisionInFlight.get(ctx);
  if (!p) {
    p = (async () => {
      const { createAuthoringRevision } = await import('@/lib/authoring/revisions');
      await createAuthoringRevision(ctx.user, ctx.outlineId, `Before: ${ctx.message.slice(0, 80)}`);
      ctx.revisionTaken = true;
    })();
    revisionInFlight.set(ctx, p);
  }
  await p;
}

function outlineView(ctx: AgentContext) {
  return {
    outlineId: ctx.detail.id,
    title: ctx.detail.title,
    focusItemId: ctx.focusItemId ?? null,
    modules: ctx.detail.modules.map((m) => ({
      id: m.id,
      title: m.title,
      items: m.items.map((i) => {
        const b = (i.body ?? {}) as OutlineItemBody;
        return {
          id: i.id,
          type: i.type,
          title: i.title,
          published: isPublished(i),
          status: i.status,
          questions: Array.isArray(b.questions) ? b.questions.length : undefined,
          startDate: b.startDate ?? undefined,
          dueDate: b.endDate ?? undefined,
          timeLimitMinutes: b.timeLimit ?? undefined,
          maxAttempts: b.maxAttempts ?? undefined,
          passingScore: b.passingScore ?? undefined,
        };
      }),
    })),
  };
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text;
}

/** Describe a write for the confirmation card. */
function describeWrite(ctx: AgentContext, tool: WriteToolName, args: Record<string, unknown>): string {
  const items = () => {
    try {
      return titles(requireItems(ctx, args.item_ids ?? (args.item_id ? [args.item_id] : [])));
    } catch {
      return 'items';
    }
  };
  const n = Array.isArray(args.item_ids) ? args.item_ids.length : 1;
  switch (tool) {
    case 'release_items':
      return `Release ${n} item${n === 1 ? '' : 's'} to students: ${items()}`;
    case 'publish_items':
      return `Publish ${n} item${n === 1 ? '' : 's'} as inactive drafts: ${items()}`;
    case 'edit_items':
      return `Edit ${n} item${n === 1 ? '' : 's'} (${items()}): ${String(args.instruction ?? '').slice(0, 160)}`;
    case 'set_schedule':
      return `Change schedule on ${n} item${n === 1 ? '' : 's'}: ${items()}`;
    case 'delete_item':
      return `Delete ${items()}`;
    case 'restore_revision':
      return 'Restore the outline to a saved revision (undo later changes)';
    case 'add_interactive_lessons':
      return 'Add an interactive lesson chapter to every module';
    case 'create_item':
      return `Create ${String(args.type ?? 'item').toLowerCase()} “${String(args.title ?? '')}”`;
    case 'create_module':
      return `Add module “${String(args.title ?? '')}”`;
  }
}

function gate(ctx: AgentContext, tool: WriteToolName, args: Record<string, unknown>): string | null {
  if (ctx.confirmed) return null;
  let targets = { count: 1, anyPublished: false };
  const list = Array.isArray(args.item_ids) ? args.item_ids : args.item_id ? [args.item_id] : [];
  if (list.length > 0) {
    const found = requireItems(ctx, list);
    targets = { count: found.length, anyPublished: found.some(isPublished) };
  }
  if (!needsConfirmation(tool, targets)) return null;
  const summary = describeWrite(ctx, tool, args);
  ctx.pending.push({ tool, args, summary });
  return JSON.stringify({
    status: 'needs_confirmation',
    willHappenOnConfirm: summary,
    note: 'Not done yet. The professor will see Confirm / Cancel buttons.',
  });
}

/** Run one tool call; returns the JSON string handed back to the model. */
export async function runAgentTool(ctx: AgentContext, name: string, rawArgs: string): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: 'Arguments were not valid JSON' });
  }
  try {
    if ((WRITE_TOOLS as readonly string[]).includes(name)) {
      const parked = gate(ctx, name as WriteToolName, args);
      if (parked) return parked;
      return JSON.stringify(await runWrite(ctx, name as WriteToolName, args));
    }
    return JSON.stringify(await runRead(ctx, name, args));
  } catch (err) {
    const message = err instanceof ApiError || err instanceof Error ? err.message : 'Tool failed';
    return JSON.stringify({ error: message });
  }
}

async function runRead(ctx: AgentContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_outline':
      await refresh(ctx);
      return outlineView(ctx);
    case 'get_item': {
      const item = findItem(ctx, String(args.item_id ?? ''));
      if (!item) throw new Error('Unknown item id. Call get_outline for valid ids.');
      const body = JSON.stringify(item.body ?? {});
      return {
        id: item.id,
        type: item.type,
        title: item.title,
        published: isPublished(item),
        // Very large bodies go back as clipped text rather than JSON.
        body: body.length <= 20_000 ? item.body ?? {} : clip(body, 20_000),
      };
    }
    case 'search_materials': {
      const query = String(args.query ?? ctx.message).slice(0, 500);
      const { text, chunks } = await buildAuthoringMaterialsContext(ctx.courseId, query, {
        materialIds: ctx.materialIds,
      });
      return {
        sources: [...new Set(chunks.map((c) => c.title))].slice(0, 12),
        passages: clip(text || '(no matching material)', 9_000),
      };
    }
    case 'get_course_calendar':
      return courseCalendar(ctx);
    case 'get_publish_checks': {
      const { runRolloverChecks } = await import('@/lib/authoring/rolloverChecks');
      const { findings } = await runRolloverChecks(ctx.user, ctx.courseId);
      return { findings: findings.slice(0, 40) };
    }
    case 'list_revisions': {
      const { listAuthoringRevisions } = await import('@/lib/authoring/revisions');
      const revs = await listAuthoringRevisions(ctx.user, ctx.outlineId);
      return revs.slice(0, 10).map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt }));
    }
    case 'confirm_pending_action': {
      if (!ctx.previousPending) throw new Error('Nothing is waiting for confirmation');
      const done = await runConfirmed(ctx, ctx.previousPending);
      ctx.previousPending = null;
      return { ran: done };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

async function courseCalendar(ctx: AgentContext) {
  const now = new Date();
  return withCourseTenant(ctx.courseId, ctx.user.id, async (tx) => {
    const secs = await tx.query.sections.findMany({
      where: and(eq(sections.courseId, ctx.courseId), isNull(sections.deletedAt)),
      columns: { name: true, isActive: true, endsAt: true, offeringId: true },
    });
    const offerings = await tx.query.courseOfferings.findMany({
      where: eq(courseOfferings.courseId, ctx.courseId),
      columns: { id: true, termLabel: true, status: true, startsAt: true, endsAt: true },
    });
    return {
      today: now.toISOString(),
      weekday: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      terms: offerings.map((o) => ({
        term: o.termLabel,
        status: o.status,
        startsAt: o.startsAt?.toISOString() ?? null,
        endsAt: o.endsAt?.toISOString() ?? null,
      })),
      sections: secs.map((s) => ({
        name: s.name,
        active: s.isActive,
        endsAt: s.endsAt?.toISOString() ?? null,
      })),
      note:
        offerings.every((o) => !o.startsAt) && secs.every((s) => !s.endsAt)
          ? 'No term or section dates are set. Ask the professor when the term starts/ends or when items are due.'
          : undefined,
    };
  });
}

/** Run a confirmed pending action (button or confirm_pending_action). */
export async function runConfirmed(ctx: AgentContext, pending: PendingAction): Promise<unknown[]> {
  const prev = ctx.confirmed;
  ctx.confirmed = true;
  const results: unknown[] = [];
  try {
    await refresh(ctx);
    for (const call of pending.calls) {
      try {
        results.push(await runWrite(ctx, call.tool, call.args));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'failed';
        ctx.log.push({ tool: call.tool, ok: false, summary: `${call.summary} — failed: ${message}`, itemIds: [] });
        results.push({ error: message });
      }
    }
  } finally {
    ctx.confirmed = prev;
  }
  return results;
}

async function runWrite(ctx: AgentContext, tool: WriteToolName, args: Record<string, unknown>): Promise<unknown> {
  switch (tool) {
    case 'edit_items': {
      const items = requireItems(ctx, args.item_ids);
      const instruction = String(args.instruction ?? '').trim();
      if (!instruction) throw new Error('instruction is required');
      const { runContentRefineTool } = await import('@/lib/authoring/agent/run');
      const { applyOutlineBuildDefiner } = await import('@/lib/db/entityScopedReads');
      const { text: materials } = await buildAuthoringMaterialsContext(ctx.courseId, instruction, {
        materialIds: ctx.materialIds,
      });
      const out = await runContentRefineTool({
        user: ctx.user,
        outlineId: ctx.detail.id,
        detail: ctx.detail,
        inventory: ctx.inventory,
        call: {
          name: 'refine_items',
          args: { selector: { scope: 'ids', itemIds: items.map((i) => i.id) }, instruction },
        },
        message: instruction,
        materialsContext: materials,
        history: [],
        courseId: ctx.courseId,
        applyOutlineBuildDefiner,
        hasPriorCorpus: ctx.detail.hasPriorCorpus,
      });
      ctx.revisionTaken = true;
      await refresh(ctx);
      if (!out.result.ok) {
        ctx.log.push({ tool, ok: false, summary: `Couldn't edit ${titles(items)}: ${out.result.error}`, itemIds: [] });
        return { error: out.result.error };
      }
      const patched = out.result.name === 'refine_items' ? out.result.patched : [];
      const skipped = items.filter((i) => !patched.some((p) => p.id === i.id));
      if (patched.length > 0) {
        ctx.log.push({ tool, ok: true, summary: `Edited ${titles(patched)}`, itemIds: patched.map((p) => p.id), kind: 'patched' });
      }
      if (skipped.length > 0) {
        ctx.log.push({ tool, ok: false, summary: `No changes made to ${titles(skipped)}`, itemIds: [] });
      }
      return {
        edited: patched.map((p) => ({ id: p.id, title: p.title })),
        unchanged: skipped.map((s) => s.title),
        note: patched.some((p) => isPublished(findItem(ctx, p.id) ?? ({} as OutlineItemSummary)))
          ? 'Some edited items are already published; republish them for students to see the change.'
          : undefined,
      };
    }
    case 'create_item': {
      const moduleId = String(args.module_id ?? '');
      const mod = ctx.detail.modules.find((m) => m.id === moduleId);
      if (!mod) throw new Error('Unknown module_id. Call get_outline for valid module ids.');
      const type = args.type === 'DISCUSSION' ? 'DISCUSSION' : 'QUIZ';
      const brief = String(args.brief ?? args.title ?? '');
      const { text: materials, chunks } = await buildAuthoringMaterialsContext(ctx.courseId, `${args.title} ${brief}`, {
        materialIds: ctx.materialIds,
      });
      const generated = await generateItemBody({
        type,
        title: String(args.title ?? 'Untitled'),
        brief,
        questionCount: typeof args.question_count === 'number' ? args.question_count : undefined,
        difficulty: args.difficulty as 'intro' | 'intermediate' | 'advanced' | undefined,
        materials,
        courseId: ctx.courseId,
      });
      await ensureRevision(ctx);
      const created = await createOutlineItem(ctx.user, {
        outlineId: ctx.detail.id,
        moduleId,
        type,
        title: generated.title,
        body: generated.body,
        sourceMaterialIds: [...new Set(chunks.map((c) => c.materialId))].slice(0, 20),
        aiMeta: { createdBy: 'authoring-agent-v2' },
      });
      await refresh(ctx);
      const count = generated.body.questions?.length;
      ctx.log.push({
        tool,
        ok: true,
        summary: `Created ${type === 'QUIZ' ? 'quiz' : 'discussion'} “${created.title}”${count ? ` (${count} questions)` : ''} in “${mod.title}”`,
        itemIds: [created.id],
        kind: 'created',
      });
      return { created: { id: created.id, title: created.title, questions: count, module: mod.title } };
    }
    case 'create_module': {
      await ensureRevision(ctx);
      const mod = await createOutlineModule(ctx.user, {
        outlineId: ctx.detail.id,
        title: String(args.title ?? 'New module'),
        summary: typeof args.summary === 'string' ? args.summary : null,
      });
      await refresh(ctx);
      ctx.log.push({ tool, ok: true, summary: `Added module “${mod.title}”`, itemIds: [] });
      return { module: mod };
    }
    case 'delete_item': {
      const [item] = requireItems(ctx, [args.item_id]);
      await ensureRevision(ctx);
      await deleteOutlineItem(ctx.user, item!.id);
      await refresh(ctx);
      ctx.log.push({ tool, ok: true, summary: `Deleted “${item!.title}”`, itemIds: [] });
      return { deleted: item!.title };
    }
    case 'set_schedule': {
      const items = requireItems(ctx, args.item_ids);
      const schedule: Record<string, unknown> = {};
      const iso = (v: unknown, field: string) => {
        if (v == null) return undefined;
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) throw new Error(`${field} is not a valid date`);
        return d.toISOString();
      };
      const start = iso(args.start_date, 'start_date');
      const due = iso(args.due_date, 'due_date');
      if (start && due && new Date(due) <= new Date(start)) throw new Error('due_date must be after start_date');
      if (start) schedule.startDate = start;
      if (due) schedule.endDate = due;
      if (typeof args.time_limit_minutes === 'number') schedule.timeLimit = args.time_limit_minutes;
      if (typeof args.max_attempts === 'number') schedule.maxAttempts = args.max_attempts;
      if (typeof args.passing_score === 'number') schedule.passingScore = args.passing_score;
      if (Object.keys(schedule).length === 0) throw new Error('Nothing to change: pass at least one schedule field');
      await ensureRevision(ctx);
      const res = await executeToolCall({
        user: ctx.user,
        outlineId: ctx.detail.id,
        detail: ctx.detail,
        inventory: ctx.inventory,
        call: {
          name: 'schedule_items',
          args: { selector: { scope: 'ids', itemIds: items.map((i) => i.id) }, schedule },
        },
        audit: ctx.audit,
      });
      await refresh(ctx);
      if (!res.ok || res.name !== 'schedule_items') {
        const error = !res.ok ? res.error : 'schedule failed';
        ctx.log.push({ tool, ok: false, summary: `Couldn't update schedule: ${error}`, itemIds: [] });
        return { error };
      }
      ctx.log.push({ tool, ok: true, summary: `Updated schedule on ${titles(res.patched)}`, itemIds: res.patched.map((p) => p.id), kind: 'patched' });
      const published = items.filter(isPublished);
      return {
        updated: res.patched.map((p) => p.title),
        note: published.length
          ? `${titles(published)} ${published.length === 1 ? 'is' : 'are'} already published; the live assignment keeps its old dates until republished.`
          : undefined,
      };
    }
    case 'publish_items': {
      const items = requireItems(ctx, args.item_ids);
      const already = items.filter(isPublished);
      const todo = items.filter((i) => !isPublished(i));
      let published: Array<{ id: string; title: string }> = [];
      let failed: Array<{ title: string | null; error: string }> = [];
      if (todo.length > 0) {
        const res = await executeToolCall({
          user: ctx.user,
          outlineId: ctx.detail.id,
          detail: ctx.detail,
          inventory: ctx.inventory,
          call: { name: 'publish_items', args: { selector: { scope: 'ids', itemIds: todo.map((i) => i.id), published: false } } },
          audit: ctx.audit,
        });
        if (!res.ok) throw new Error(res.error);
        if (res.name === 'publish_items') {
          published = res.published;
          failed = res.failed;
        }
      }
      await refresh(ctx);
      if (published.length) {
        ctx.log.push({ tool, ok: true, summary: `Published ${titles(published)} as inactive drafts`, itemIds: published.map((p) => p.id), kind: 'published' });
      }
      for (const f of failed) {
        ctx.log.push({ tool, ok: false, summary: `Couldn't publish “${f.title ?? 'item'}”: ${f.error}`, itemIds: [] });
      }
      return { published: published.map((p) => p.title), alreadyPublished: already.map((a) => a.title), failed };
    }
    case 'release_items': {
      const items = requireItems(ctx, args.item_ids);
      const notPublished = items.filter((i) => !isPublished(i));
      const ready = items.filter(isPublished);
      const released: Array<{ id: string; title: string }> = [];
      const failed: Array<{ title: string; error: string }> = notPublished.map((i) => ({
        title: i.title,
        error: 'not published yet — publish it first',
      }));
      if (ready.length > 0) {
        const res = await executeToolCall({
          user: ctx.user,
          outlineId: ctx.detail.id,
          detail: ctx.detail,
          inventory: ctx.inventory,
          call: { name: 'release_items', args: { selector: { scope: 'ids', itemIds: ready.map((i) => i.id), published: true } } },
          audit: ctx.audit,
        });
        if (!res.ok) throw new Error(res.error);
        if (res.name === 'release_items') {
          released.push(...res.released);
          failed.push(...res.failed.map((f) => ({ title: f.title, error: f.error })));
        }
      }
      await refresh(ctx);
      if (released.length) {
        ctx.log.push({ tool, ok: true, summary: `Released ${titles(released)} to students`, itemIds: released.map((r) => r.id), kind: 'released' });
      }
      for (const f of failed) {
        ctx.log.push({ tool, ok: false, summary: `Couldn't release “${f.title}”: ${f.error}`, itemIds: [] });
      }
      return { released: released.map((r) => r.title), failed };
    }
    case 'restore_revision': {
      const { listAuthoringRevisions, restoreAuthoringRevision } = await import('@/lib/authoring/revisions');
      const revs = await listAuthoringRevisions(ctx.user, ctx.outlineId);
      const target = args.revision_id ? revs.find((r) => r.id === args.revision_id) : revs[0];
      if (!target) throw new Error(args.revision_id ? 'Unknown revision id' : 'No revisions to restore yet');
      await restoreAuthoringRevision(ctx.user, target.id);
      await refresh(ctx);
      ctx.log.push({ tool, ok: true, summary: `Restored revision “${target.label}”`, itemIds: [] });
      return { restored: target.label };
    }
    case 'add_interactive_lessons': {
      const { ensureInteractiveLessonsForOutline } = await import('@/lib/authoring/ensureLessons');
      const res = await ensureInteractiveLessonsForOutline(ctx.user, ctx.detail.id, ctx.audit);
      ctx.outlineOverride = res.outline;
      await refresh(ctx);
      const lessonIds = ctx.detail.modules.flatMap((m) => m.items.filter((i) => i.type === 'LESSON').map((i) => i.id));
      ctx.log.push({
        tool,
        ok: res.alreadyComplete || res.lessonsBuilt > 0,
        summary: res.alreadyComplete
          ? 'Every module already has an interactive lesson'
          : `Added ${res.lessonsAdded} interactive lesson${res.lessonsAdded === 1 ? '' : 's'} (${res.lessonsBuilt} written)`,
        itemIds: lessonIds,
        kind: 'patched',
      });
      return { lessonsAdded: res.lessonsAdded, lessonsWritten: res.lessonsBuilt, alreadyComplete: res.alreadyComplete };
    }
  }
}
