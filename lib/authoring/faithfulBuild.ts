import type { OutlineItemBody } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { parseBuiltAssignmentItem } from '@/lib/authoring/generate';
import { normalizeQuizScheduleToFuture } from '@/lib/authoring/schedule';
import type { OutlineItemType } from '@/app/db/enums';

export type FaithfulExpectedItem = {
  itemId: string;
  type: OutlineItemType;
  title: string;
  interactiveKind?: OutlineItemBody['interactiveKind'];
};

export type FaithfulItemPatch = {
  itemId: string;
  title?: string;
  body: OutlineItemBody;
  sourceMaterialIds?: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readItemId(raw: unknown): string | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const id = record.itemId ?? record.item_id ?? record.id;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

/** Pull assignment objects out of the shapes models actually return. */
export function extractFaithfulItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const root = asRecord(raw);
  if (!root) return [];
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.assignments)) return root.assignments;
  const modules = root.modules ?? root.Modules;
  if (!Array.isArray(modules)) return [];
  const items: unknown[] = [];
  for (const mod of modules) {
    const record = asRecord(mod);
    const list = record?.items ?? record?.activities ?? record?.assignments;
    if (Array.isArray(list)) items.push(...list);
  }
  return items;
}

function toBody(
  item: ReturnType<typeof parseBuiltAssignmentItem>,
): OutlineItemBody {
  return normalizeQuizScheduleToFuture({
    markdown: item.markdown,
    description: item.description,
    flashcards: item.flashcards,
    chapter: item.chapter as OutlineItemBody['chapter'],
    questions: item.questions,
    sourceCitations: item.sourceCitations,
    unsupportedFacts: item.unsupportedFacts,
    maxAttempts: item.maxAttempts,
    passingScore: item.passingScore,
    timeLimit: item.timeLimit,
    startDate: item.startDate,
    endDate: item.endDate,
    systemPrompt: item.systemPrompt,
    instructions: item.instructions,
    personaName: item.personaName,
    interactiveKind: item.interactiveKind,
    interactiveBody: item.interactiveBody as OutlineItemBody['interactiveBody'],
  });
}

export type FaithfulItemPatchWithMeta = FaithfulItemPatch & {
  sourceMaterialIds?: string[];
};

/**
 * Match a model payload to the approved skeleton and validate every body
 * before anything is saved.
 */
export function assembleFaithfulItemBodies(
  expected: FaithfulExpectedItem[],
  raw: unknown,
): FaithfulItemPatch[] {
  const rawItems = extractFaithfulItems(raw);
  const byId = new Map<string, unknown>();
  for (const item of rawItems) {
    const id = readItemId(item);
    if (id) byId.set(id, item);
  }

  const matchedCount = expected.filter((item) => byId.has(item.itemId)).length;
  const useOrder =
    matchedCount === 0 && rawItems.length === expected.length && expected.length > 0;

  const patches: FaithfulItemPatch[] = [];
  const missing: string[] = [];

  expected.forEach((item, index) => {
    const source = byId.get(item.itemId) ?? (useOrder ? rawItems[index] : undefined);
    if (!source) {
      missing.push(item.title);
      return;
    }

    const record = asRecord(source) ?? {};
    const title =
      typeof record.title === 'string' && record.title.trim()
        ? record.title.trim()
        : item.title;

    let parsed: ReturnType<typeof parseBuiltAssignmentItem>;
    try {
      parsed = parseBuiltAssignmentItem({
        ...record,
        type: item.type,
        title,
        interactiveKind: record.interactiveKind ?? item.interactiveKind,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'invalid body';
      throw ApiError.badRequest(`${item.title}: ${reason}`);
    }

    if (parsed.type !== item.type) {
      throw ApiError.badRequest(
        `${item.title}: expected a ${item.type} body`,
      );
    }
    if (
      item.type === 'INTERACTIVE' &&
      item.interactiveKind === 'FILL_BLANKS' &&
      parsed.interactiveKind !== 'FILL_BLANKS'
    ) {
      throw ApiError.badRequest(
        `${item.title}: this practice activity must stay fill-in-the-blanks`,
      );
    }

    const body = toBody(parsed);
    const sourceMaterialIds = Array.isArray(record.sourceMaterialIds)
      ? record.sourceMaterialIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        )
      : [];
    patches.push({
      itemId: item.itemId,
      title,
      body,
      sourceMaterialIds,
    });
  });

  if (missing.length > 0) {
    throw ApiError.badRequest(
      `Missing assignment bodies for ${missing.join(', ')}`,
    );
  }

  return patches;
}
