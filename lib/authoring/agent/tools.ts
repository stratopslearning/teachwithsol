import { z } from 'zod';

import type { OutlineItemBody } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import type { OutlineInventory, InventoryItem } from '@/lib/authoring/agent/inventory';
import {
  isHollowQuizBody,
  mergeOutlineItemBody,
  pickScheduleScoringPatch,
  restoreQuizContentFromFallback,
} from '@/lib/authoring/bodyMerge';
import type { OutlineDetail, OutlineItemSummary } from '@/lib/authoring/outlines';
import { publishOutlineItems, releaseOutlineItem } from '@/lib/authoring/publish';
import type { UserData } from '@/lib/getOrCreateUser';

type AuthUser = Pick<UserData, 'id' | 'clerkId'> & { platformStaff?: boolean | null };

export const TOOL_NAMES = [
  'list_outline',
  'publish_items',
  'release_items',
  'schedule_items',
  'refine_items',
  'ensure_interactive_lessons',
  'answer_question',
  'restore_revision',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const itemTypeSchema = z.enum([
  'QUIZ',
  'DISCUSSION',
  'LESSON',
  'INTERACTIVE',
]);

export const itemSelectorSchema = z.object({
  scope: z.enum(['first', 'last', 'all', 'ids', 'focus']).default('all'),
  count: z.number().int().min(1).max(40).optional(),
  types: z.array(itemTypeSchema).optional(),
  itemIds: z.array(z.string().uuid()).optional(),
  /** When true, only unpublished (for publish). When false, only published (for release). Omit = either. */
  published: z.boolean().optional(),
});

export type ItemSelector = z.infer<typeof itemSelectorSchema>;

const schedulePatchSchema = z.object({
  maxAttempts: z.number().int().min(1).max(20).optional(),
  timeLimit: z.number().int().min(1).max(600).nullable().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
});

export const toolCallSchema = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('list_outline'),
    args: z.object({}).default({}),
  }),
  z.object({
    name: z.literal('publish_items'),
    args: z.object({
      selector: itemSelectorSchema.default({ scope: 'all', types: ['QUIZ'] }),
    }),
  }),
  z.object({
    name: z.literal('release_items'),
    args: z.object({
      selector: itemSelectorSchema.default({ scope: 'all', types: ['QUIZ'] }),
    }),
  }),
  z.object({
    name: z.literal('schedule_items'),
    args: z.object({
      selector: itemSelectorSchema.default({ scope: 'all' }),
      schedule: schedulePatchSchema.default({}),
    }),
  }),
  z.object({
    name: z.literal('refine_items'),
    args: z.object({
      selector: itemSelectorSchema.default({ scope: 'focus' }),
      instruction: z.string().min(1).max(2000),
    }),
  }),
  z.object({
    name: z.literal('ensure_interactive_lessons'),
    args: z.object({}).default({}),
  }),
  z.object({
    name: z.literal('answer_question'),
    args: z.object({
      question: z.string().min(1).max(2000),
      mode: z.enum(['status', 'advise', 'help', 'decline']).optional(),
    }),
  }),
  z.object({
    name: z.literal('restore_revision'),
    args: z.object({
      revisionId: z.string().uuid().optional(),
      /** When true, restore the most recent revision. */
      latest: z.boolean().optional(),
    }),
  }),
]);

export type ToolCall = z.infer<typeof toolCallSchema>;

export const plannerPlanSchema = z.object({
  tools: z.array(toolCallSchema).min(1).max(6),
  note: z.string().max(500).optional(),
});

export type PlannerPlan = z.infer<typeof plannerPlanSchema>;

export type ToolResult =
  | {
      name: 'list_outline';
      ok: true;
      summary: string;
    }
  | {
      name: 'publish_items';
      ok: true;
      published: Array<{ id: string; title: string }>;
      failed: Array<{ id: string; title: string | null; error: string }>;
      resolvedIds: string[];
    }
  | {
      name: 'release_items';
      ok: true;
      released: Array<{ id: string; title: string }>;
      failed: Array<{ id: string; title: string; error: string }>;
      resolvedIds: string[];
    }
  | {
      name: 'schedule_items';
      ok: true;
      patched: Array<{ id: string; title: string }>;
      resolvedIds: string[];
    }
  | {
      name: 'refine_items';
      ok: true;
      patched: Array<{ id: string; title: string }>;
      resolvedIds: string[];
      assistantNote?: string;
    }
  | {
      name: 'ensure_interactive_lessons';
      ok: true;
      lessonsAdded: number;
      lessonsBuilt: number;
      alreadyComplete: boolean;
      outlineId: string;
      patched: Array<{ id: string; title: string }>;
    }
  | {
      name: 'answer_question';
      ok: true;
      answer: string;
    }
  | {
      name: 'restore_revision';
      ok: true;
      revisionId: string;
      label: string;
    }
  | {
      name: ToolName;
      ok: false;
      error: string;
    };

/** Resolve selector against inventory order (server-owned; ignores invented titles). */
export function resolveItemSelector(
  inventory: OutlineInventory,
  selector: ItemSelector,
): InventoryItem[] {
  const types =
    selector.types && selector.types.length > 0
      ? new Set(selector.types)
      : null;

  const pool = inventory.items.filter((item) => {
    if (types && !types.has(item.type)) return false;
    if (selector.published === true && !item.published) return false;
    if (selector.published === false && item.published) return false;
    return true;
  });

  switch (selector.scope) {
    case 'focus': {
      if (!inventory.focus) return [];
      const focus = pool.find((i) => i.id === inventory.focus!.id);
      return focus ? [focus] : [];
    }
    case 'ids': {
      const wanted = new Set(selector.itemIds ?? []);
      const known = new Set(inventory.items.map((i) => i.id));
      for (const id of wanted) {
        if (!known.has(id)) {
          throw ApiError.badRequest(`Unknown item id: ${id}`);
        }
      }
      return pool.filter((i) => wanted.has(i.id));
    }
    case 'first': {
      const n = selector.count ?? 1;
      return pool.slice(0, n);
    }
    case 'last': {
      const n = selector.count ?? 1;
      return pool.slice(-n);
    }
    case 'all':
    default: {
      if (selector.count != null) {
        return pool.slice(0, selector.count);
      }
      return pool;
    }
  }
}

export function formatToolResultsReply(results: ToolResult[]): string {
  const parts: string[] = [];
  for (const r of results) {
    if (!r.ok) {
      parts.push(`Could not run ${r.name}: ${r.error}`);
      continue;
    }
    switch (r.name) {
      case 'list_outline':
        parts.push(r.summary);
        break;
      case 'publish_items': {
        if (r.published.length > 0) {
          const bullets = r.published
            .slice(0, 8)
            .map((p) => `- ${p.title}`)
            .join('\n');
          parts.push(
            [
              `### Published ${r.published.length} draft${
                r.published.length === 1 ? '' : 's'
              }`,
              '',
              bullets,
              r.published.length > 8
                ? `\n- … +${r.published.length - 8} more`
                : '',
              '',
              'They’re inactive until you **release** them to students.',
            ]
              .filter(Boolean)
              .join('\n'),
          );
        } else if (r.failed.length === 0) {
          parts.push(
            'Nothing left to publish — matching assignments are already drafts, or none matched your request.',
          );
        }
        if (r.failed.length > 0) {
          const sample = r.failed
            .slice(0, 3)
            .map((f) => `- ${f.title ? `**${f.title}** — ` : ''}${f.error}`)
            .join('\n');
          parts.push(
            [`### Could not publish ${r.failed.length}`, '', sample].join(
              '\n',
            ),
          );
        }
        break;
      }
      case 'release_items': {
        if (r.released.length > 0) {
          const bullets = r.released
            .slice(0, 8)
            .map((p) => `- ${p.title}`)
            .join('\n');
          parts.push(
            [
              `### Released ${r.released.length} assignment${
                r.released.length === 1 ? '' : 's'
              }`,
              '',
              bullets,
              r.released.length > 8
                ? `\n- … +${r.released.length - 8} more`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          );
        } else if (r.failed.length === 0) {
          parts.push(
            'Nothing to release — publish drafts first, then ask to release.',
          );
        }
        if (r.failed.length > 0) {
          const sample = r.failed
            .slice(0, 3)
            .map((f) => `- **${f.title}** — ${f.error}`)
            .join('\n');
          parts.push(
            [`### Could not release ${r.failed.length}`, '', sample].join(
              '\n',
            ),
          );
        }
        break;
      }
      case 'schedule_items': {
        if (r.patched.length === 0) {
          parts.push('No matching items to update schedule for.');
        } else {
          const bullets = r.patched
            .slice(0, 8)
            .map((p) => `- ${p.title}`)
            .join('\n');
          parts.push(
            [
              `### Updated schedule on ${r.patched.length}`,
              '',
              bullets,
              r.patched.length > 8
                ? `\n- … +${r.patched.length - 8} more`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          );
        }
        break;
      }
      case 'refine_items': {
        if (r.assistantNote?.trim()) {
          parts.push(r.assistantNote.trim());
        } else if (r.patched.length === 0) {
          parts.push('No matching items to refine.');
        } else {
          const bullets = r.patched
            .slice(0, 8)
            .map((p) => `- ${p.title}`)
            .join('\n');
          parts.push(
            [
              `### Updated ${r.patched.length} assignment${
                r.patched.length === 1 ? '' : 's'
              }`,
              '',
              bullets,
              r.patched.length > 8
                ? `\n- … +${r.patched.length - 8} more`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          );
        }
        break;
      }
      case 'ensure_interactive_lessons': {
        if (r.alreadyComplete) {
          parts.push(
            '### Interactive lessons ready\n\nEvery module already starts with a Shah-style interactive chapter.',
          );
        } else if (r.lessonsBuilt === 0) {
          parts.push(
            [
              '### Interactive lessons incomplete',
              '',
              r.lessonsAdded > 0
                ? `Prepended **${r.lessonsAdded}** LESSON slot${
                    r.lessonsAdded === 1 ? '' : 's'
                  }, but chapter bodies were not written.`
                : 'LESSON slots are present, but chapter bodies still need to be written.',
              '',
              'Say **add interactive lessons to each module** again to build the reading + practice checks.',
            ].join('\n'),
          );
        } else {
          const bullets = r.patched
            .slice(0, 8)
            .map((p) => `- ${p.title}`)
            .join('\n');
          parts.push(
            [
              '### Added interactive lessons',
              '',
              `Prepended **${r.lessonsAdded}** Shah-style LESSON chapter${
                r.lessonsAdded === 1 ? '' : 's'
              } and built **${r.lessonsBuilt}** interactive bod${
                r.lessonsBuilt === 1 ? 'y' : 'ies'
              }.`,
              bullets ? `\n${bullets}` : '',
              r.patched.length > 8
                ? `\n- … +${r.patched.length - 8} more`
                : '',
              '',
              'Each module now opens with an interactive chapter (reading + practice checks), then the graded work.',
            ]
              .filter(Boolean)
              .join('\n'),
          );
        }
        break;
      }
      case 'answer_question':
        parts.push(r.answer);
        break;
      case 'restore_revision':
        parts.push(
          [
            '### Restored revision',
            '',
            `Rolled back to **${r.label}**. The outline matches that snapshot.`,
          ].join('\n'),
        );
        break;
      default:
        break;
    }
  }
  return parts.filter(Boolean).join('\n\n') || 'Done.';
}

function findOutlineItem(
  detail: OutlineDetail,
  itemId: string,
): OutlineItemSummary | null {
  for (const mod of detail.modules) {
    const hit = mod.items.find((i) => i.id === itemId);
    if (hit) return hit;
  }
  return null;
}

export async function executeToolCall(opts: {
  user: AuthUser;
  outlineId: string;
  detail: OutlineDetail;
  inventory: OutlineInventory;
  call: ToolCall;
  audit?: { ip?: string | null; userAgent?: string | null };
  materialsContext?: string;
}): Promise<ToolResult> {
  const { user, outlineId, detail, inventory, call, audit } = opts;

  try {
    switch (call.name) {
      case 'list_outline': {
        const { inventoryHumanSummary } = await import(
          '@/lib/authoring/agent/inventory'
        );
        return {
          name: 'list_outline',
          ok: true,
          summary: inventoryHumanSummary(inventory),
        };
      }
      case 'publish_items': {
        const selector = {
          ...call.args.selector,
          published:
            call.args.selector.published === undefined
              ? false
              : call.args.selector.published,
        };
        const resolved = resolveItemSelector(inventory, selector);
        const resolvedIds = resolved.map((i) => i.id);
        if (resolvedIds.length === 0) {
          return {
            name: 'publish_items',
            ok: true,
            published: [],
            failed: [],
            resolvedIds: [],
          };
        }
        const result = await publishOutlineItems(
          user,
          outlineId,
          resolvedIds,
          undefined,
          audit,
        );
        return {
          name: 'publish_items',
          ok: true,
          published: result.published.map((p) => ({
            id: p.id,
            title: p.title,
          })),
          failed: result.failed.map((f) => ({
            id: f.itemId,
            title: f.title,
            error: f.error,
          })),
          resolvedIds,
        };
      }
      case 'release_items': {
        const selector = {
          ...call.args.selector,
          published:
            call.args.selector.published === undefined
              ? true
              : call.args.selector.published,
        };
        const resolved = resolveItemSelector(inventory, selector);
        const released: Array<{ id: string; title: string }> = [];
        const failed: Array<{ id: string; title: string; error: string }> = [];
        for (const item of resolved) {
          try {
            await releaseOutlineItem(user, item.id, audit);
            released.push({ id: item.id, title: item.title });
          } catch (err) {
            failed.push({
              id: item.id,
              title: item.title,
              error:
                err instanceof ApiError
                  ? err.message
                  : err instanceof Error
                    ? err.message
                    : 'Release failed',
            });
          }
        }
        return {
          name: 'release_items',
          ok: true,
          released,
          failed,
          resolvedIds: resolved.map((i) => i.id),
        };
      }
      case 'schedule_items': {
        const resolved = resolveItemSelector(inventory, call.args.selector);
        const patches: Array<{
          itemId: string;
          body: OutlineItemBody;
        }> = [];
        const patched: Array<{ id: string; title: string }> = [];
        for (const inv of resolved) {
          const existing = findOutlineItem(detail, inv.id);
          if (!existing) continue;
          const rawPatch = call.args.schedule as OutlineItemBody;
          const safePatch = pickScheduleScoringPatch(rawPatch);
          let nextBody = mergeOutlineItemBody(existing.body ?? {}, safePatch);
          if (
            existing.type === 'QUIZ' &&
            !isHollowQuizBody(existing.body) &&
            isHollowQuizBody(nextBody)
          ) {
            nextBody = restoreQuizContentFromFallback(nextBody, existing.body);
          }
          patches.push({ itemId: inv.id, body: nextBody });
          patched.push({ id: inv.id, title: inv.title });
        }
        if (patches.length > 0) {
          const { applyOutlineBuildDefiner } = await import(
            '@/lib/db/entityScopedReads'
          );
          await applyOutlineBuildDefiner({
            outlineId,
            patches,
            hasPriorCorpus: detail.hasPriorCorpus,
          });
        }
        return {
          name: 'schedule_items',
          ok: true,
          patched,
          resolvedIds: resolved.map((i) => i.id),
        };
      }
      case 'refine_items': {
        // Content refine is executed by the runner with a dedicated LLM call.
        // Here we only resolve targets; runner fills patches.
        const resolved = resolveItemSelector(inventory, call.args.selector);
        return {
          name: 'refine_items',
          ok: true,
          patched: [],
          resolvedIds: resolved.map((i) => i.id),
          assistantNote: undefined,
        };
      }
      case 'answer_question': {
        return {
          name: 'answer_question',
          ok: true,
          answer: '', // filled by runner LLM
        };
      }
      case 'restore_revision': {
        const { listAuthoringRevisions, restoreAuthoringRevision } =
          await import('@/lib/authoring/revisions');
        let revisionId = call.args.revisionId;
        let label = 'revision';
        if (!revisionId || call.args.latest) {
          const revisions = await listAuthoringRevisions(user, outlineId);
          const latest = revisions[0];
          if (!latest) {
            return {
              name: 'restore_revision',
              ok: false,
              error: 'No revisions to restore yet.',
            };
          }
          revisionId = latest.id;
          label = latest.label;
        } else {
          const revisions = await listAuthoringRevisions(user, outlineId);
          label =
            revisions.find((r) => r.id === revisionId)?.label ?? 'revision';
        }
        await restoreAuthoringRevision(user, revisionId);
        return {
          name: 'restore_revision',
          ok: true,
          revisionId,
          label,
        };
      }
      default:
        return {
          name: 'list_outline',
          ok: false,
          error: 'Unknown tool',
        };
    }
  } catch (err) {
    return {
      name: call.name,
      ok: false,
      error:
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Tool failed',
    };
  }
}
