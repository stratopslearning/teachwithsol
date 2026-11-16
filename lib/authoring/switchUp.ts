import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { outlineItems, type OutlineItemBody } from '@/app/db/schema';
import { getAiClientForTask, resolveModel } from '@/lib/ai/gateway';
import { temperatureForModel } from '@/lib/ai/modelRouter';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { ApiError } from '@/lib/api/errors';
import { logAudit } from '@/lib/audit';
import { assertCanManageOutline } from '@/lib/authoring/access';
import { AUTHORING_PROMPT_VERSION } from '@/lib/authoring/constants';
import { buildAuthoringMaterialsContext } from '@/lib/authoring/context';
import {
  getOutlineDetail,
  type OutlineDetail,
  type OutlineItemSummary,
} from '@/lib/authoring/outlines';
import { getAuthoringPolicyForCourse } from '@/lib/authoring/policies';
import { withOutlineTenant } from '@/lib/authoring/tenant';
import { loadCoursePromptContext } from '@/lib/ai/prompts/courseContext';
import {
  buildSwitchUpSystemPrompt,
  defaultAuthoringQuery,
  formatAuthoringPolicyPrompt,
} from '@/lib/authoring/prompts';
import { createAuthoringRevision } from '@/lib/authoring/revisions';
import { validateSwitchUpVariant } from '@/lib/authoring/switchUpValidate';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { AuthUser } from '@/lib/getOrCreateUser';

const switchResponseSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      body: z.record(z.string(), z.unknown()),
      variantKey: z.string().min(1).max(80).optional(),
    }),
  ),
});

export type SwitchUpDiff = {
  itemId: string;
  title: string;
  type: OutlineItemSummary['type'];
  before: OutlineItemBody;
  after: OutlineItemBody;
  similarity: number;
  keyCheckOk?: boolean;
  keyCheckReasons?: string[];
  accepted?: boolean;
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

/** Jaccard similarity on token sets (0 = different, 1 = identical). */
export function textSimilarity(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function itemBodySimilarity(
  before: OutlineItemBody,
  after: OutlineItemBody,
): number {
  const beforeText = JSON.stringify({
    q: (before.questions ?? []).map((q) => q.question),
    sp: before.systemPrompt,
    ins: before.instructions,
    ib: before.interactiveBody,
  });
  const afterText = JSON.stringify({
    q: (after.questions ?? []).map((q) => q.question),
    sp: after.systemPrompt,
    ins: after.instructions,
    ib: after.interactiveBody,
  });
  return textSimilarity(beforeText, afterText);
}

const SIMILARITY_MAX = 0.55;

/**
 * Generate switch-up variants (preview diffs). Does not apply until acceptSwitchUp.
 */
export async function proposeSwitchUp(
  user: AuthUser,
  opts: {
    outlineId: string;
    itemIds?: string[];
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<{ diffs: SwitchUpDiff[]; outline: OutlineDetail }> {
  const outlineRow = await assertCanManageOutline(user, opts.outlineId);
  const detail = await getOutlineDetail(user, opts.outlineId);
  if (!detail.bodiesBuilt || detail.status !== 'READY') {
    throw ApiError.badRequest(
      'Approve and build the outline before switching up assignments',
    );
  }

  const allItems = detail.modules.flatMap((m) => m.items);
  const targets = opts.itemIds?.length
    ? allItems.filter((i) => opts.itemIds!.includes(i.id))
    : allItems.filter((i) => i.type === 'QUIZ' || i.type === 'DISCUSSION' || i.type === 'INTERACTIVE');

  if (targets.length === 0) {
    throw ApiError.badRequest('No items selected to switch up');
  }

  const course = await assertCanManageCourse(user, outlineRow.courseId);
  const policy = await getAuthoringPolicyForCourse(outlineRow.courseId);
  const { text: materialsContext } = await buildAuthoringMaterialsContext(
    outlineRow.courseId,
    detail.brief?.trim() || defaultAuthoringQuery(course.title),
    { preferPrior: true },
  );

  if (!process.env.OPENAI_API_KEY) {
    throw ApiError.badRequest('OpenAI is not configured');
  }

  const openai = getAiClientForTask('switch_up', { timeout: 90_000 });
  const switchModel = resolveModel('switch_up').model;
  const policyBlock = formatAuthoringPolicyPrompt(policy);
  const courseCtx = await loadCoursePromptContext(detail.courseId);
  const switchSystem = buildSwitchUpSystemPrompt(courseCtx);

  async function callOnce(): Promise<SwitchUpDiff[]> {
    const userMsg = `Course: ${course.title}
Switch up these items (same structure/objectives; new wording). Original answer keys must NOT work on the variants:
${JSON.stringify(
  targets.map((t) => ({
    itemId: t.id,
    type: t.type,
    title: t.title,
    body: t.faithfulBody ?? t.body,
  })),
)}

Materials:
${materialsContext || '(none)'}${policyBlock}`;

    const switchTemp = temperatureForModel(switchModel, 0.7);
    const completion = await openai.chat.completions.create({
      model: switchModel,
      ...(switchTemp != null ? { temperature: switchTemp } : {}),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${switchSystem}\nPROMPT_VERSION=${AUTHORING_PROMPT_VERSION}`,
        },
        { role: 'user', content: userMsg },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('empty');
    const parsed = switchResponseSchema.safeParse(JSON.parse(content));
    if (!parsed.success) throw new Error(parsed.error.message);

    const byId = new Map(targets.map((t) => [t.id, t]));
    const diffs: SwitchUpDiff[] = [];
    for (const patch of parsed.data.items) {
      const existing = byId.get(patch.itemId);
      if (!existing) continue;
      const before = (existing.faithfulBody ?? existing.body) as OutlineItemBody;
      const after = {
        ...before,
        ...(patch.body as OutlineItemBody),
      };
      const similarity = itemBodySimilarity(before, after);
      const keyCheck = validateSwitchUpVariant(before, after, similarity, SIMILARITY_MAX);
      diffs.push({
        itemId: existing.id,
        title: patch.title ?? existing.title,
        type: existing.type,
        before,
        after,
        similarity,
        keyCheckOk: keyCheck.ok,
        keyCheckReasons: keyCheck.reasons,
      });
    }
    return diffs;
  }

  let diffs: SwitchUpDiff[];
  try {
    diffs = await callOnce();
    const bad = diffs.filter((d) => !d.keyCheckOk);
    if (bad.length > 0) {
      // One regenerate for failed key/similarity checks
      diffs = await callOnce();
    }
  } catch (err) {
    console.error('proposeSwitchUp failed', err);
    throw ApiError.badRequest('Switch up didn’t come together');
  }

  // Reject if still failing similarity or key checks
  for (const d of diffs) {
    if (!d.keyCheckOk) {
      throw ApiError.badRequest(
        `Variant for “${d.title}” failed validation: ${(d.keyCheckReasons ?? []).join('; ') || 'too similar or keys still work'}. Try again.`,
      );
    }
  }

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'professor.authoring.switch_up_propose',
    targetType: 'course_outline',
    targetId: opts.outlineId,
    tenantId: outlineRow.tenantId,
    metadata: { itemCount: diffs.length },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  void logAiSpan('authoring.switch_up', 'authoring', {
    outlineId: hashId(opts.outlineId),
    itemCount: diffs.length,
  });

  return { diffs, outline: detail };
}

/** Apply accepted switch-up diffs to outline items. */
export async function acceptSwitchUp(
  user: AuthUser,
  opts: {
    outlineId: string;
    items: Array<{ itemId: string; title?: string; body: OutlineItemBody }>;
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<OutlineDetail> {
  const outlineRow = await assertCanManageOutline(user, opts.outlineId);
  const detail = await getOutlineDetail(user, opts.outlineId);
  await createAuthoringRevision(user, opts.outlineId, 'Before switch up');

  const known = new Map(
    detail.modules.flatMap((m) => m.items.map((i) => [i.id, i])),
  );

  await withOutlineTenant(opts.outlineId, user.id, async (tx) => {
    for (const patch of opts.items) {
      const existing = known.get(patch.itemId);
      if (!existing) continue;
      const faithful = existing.faithfulBody ?? existing.body;
      await tx
        .update(outlineItems)
        .set({
          title: patch.title?.trim() || existing.title,
          body: patch.body,
          faithfulBody: faithful,
          variantOfItemId: existing.variantOfItemId ?? existing.id,
          updatedAt: new Date(),
        })
        .where(eq(outlineItems.id, patch.itemId));
    }
  });

  await createAuthoringRevision(user, opts.outlineId, 'Switch up applied');

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'professor.authoring.switch_up_accept',
    targetType: 'course_outline',
    targetId: opts.outlineId,
    tenantId: outlineRow.tenantId,
    metadata: { itemCount: opts.items.length },
    ip: audit?.ip ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  return getOutlineDetail(user, opts.outlineId);
}
