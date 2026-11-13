import type {
  InventoryItem,
  OutlineInventory,
} from '@/lib/authoring/agent/inventory';
import type { ItemSelector } from '@/lib/authoring/agent/tools';
import {
  looksLikeProposeOutlineRequest,
  parseQuantityLimit,
} from '@/lib/authoring/intent';

export type TargetResolution = {
  itemIds: string[];
  confidence: number;
  candidates: Array<{ id: string; title: string; score: number }>;
  question: string | null;
  selector: ItemSelector;
};

/** Resolve which outline items a prompt likely refers to. */
export function resolveAuthoringTargets(
  message: string,
  inventory: OutlineInventory,
  opts?: { preferFocus?: boolean },
): TargetResolution {
  const m = message.toLowerCase();
  const quantity = parseQuantityLimit(message);
  const types = typesFromMessage(m);

  // Outline propose/regenerate is not an item-target question.
  if (looksLikeProposeOutlineRequest(message)) {
    return {
      itemIds: [],
      confidence: 0.2,
      candidates: [],
      question: null,
      selector: { scope: 'all' },
    };
  }

  // Explicit title hits
  const scored = inventory.items
    .map((item) => ({
      id: item.id,
      title: item.title,
      score: titleScore(m, item),
    }))
    .filter((c) => c.score >= 0.45)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1 && scored[0]!.score >= 0.72) {
    return {
      itemIds: [scored[0]!.id],
      confidence: scored[0]!.score,
      candidates: scored.slice(0, 5),
      question: null,
      selector: { scope: 'ids', itemIds: [scored[0]!.id] },
    };
  }

  if (scored.length > 1 && scored[0]!.score - scored[1]!.score < 0.12) {
    const names = scored
      .slice(0, 4)
      .map((c) => `“${c.title}”`)
      .join(', ');
    return {
      itemIds: [],
      confidence: 0.4,
      candidates: scored.slice(0, 5),
      question: `Which assignment did you mean — ${names}?`,
      selector: { scope: 'all' },
    };
  }

  if (scored.length >= 1 && scored[0]!.score >= 0.72) {
    return {
      itemIds: [scored[0]!.id],
      confidence: scored[0]!.score,
      candidates: scored.slice(0, 5),
      question: null,
      selector: { scope: 'ids', itemIds: [scored[0]!.id] },
    };
  }

  // Focus item when user says "this" / "it"
  if (
    inventory.focus &&
    /\b(this|that|it|the focused|current)\b/.test(m)
  ) {
    return {
      itemIds: [inventory.focus.id],
      confidence: 0.8,
      candidates: [
        {
          id: inventory.focus.id,
          title: inventory.focus.title,
          score: 0.8,
        },
      ],
      question: null,
      selector: { scope: 'focus' },
    };
  }

  // Quantity / type selectors ("first three quizzes")
  if (quantity || types) {
    const scope =
      quantity == null ? 'all' : quantity.fromEnd ? 'last' : 'first';
    const selector: ItemSelector = {
      scope,
      count: quantity?.count,
      types: types ? [...types] : undefined,
    };
    const pool = filterPool(inventory.items, types);
    const ordered =
      scope === 'last' ? [...pool].reverse() : pool;
    const picked =
      quantity?.count != null
        ? ordered.slice(0, quantity.count)
        : ordered;
    return {
      itemIds: picked.map((i) => i.id),
      confidence: picked.length > 0 ? 0.85 : 0.3,
      candidates: picked.slice(0, 5).map((i) => ({
        id: i.id,
        title: i.title,
        score: 0.85,
      })),
      question:
        picked.length === 0
          ? 'I could not find matching assignments for that filter. Name a title or open one in the outline.'
          : null,
      selector,
    };
  }

  if (/\b(all|every|entire|whole)\b/.test(m)) {
    return {
      itemIds: inventory.items.map((i) => i.id),
      confidence: 0.88,
      candidates: inventory.items.slice(0, 5).map((i) => ({
        id: i.id,
        title: i.title,
        score: 0.88,
      })),
      question: null,
      selector: { scope: 'all', types: types ? [...types] : undefined },
    };
  }

  if (inventory.focus) {
    return {
      itemIds: [inventory.focus.id],
      confidence: 0.55,
      candidates: [
        {
          id: inventory.focus.id,
          title: inventory.focus.title,
          score: 0.55,
        },
      ],
      question: `Do you mean the focused item “${inventory.focus.title}”, or should I apply this more broadly?`,
      selector: { scope: 'focus' },
    };
  }

  return {
    itemIds: [],
    confidence: 0.25,
    candidates: inventory.items.slice(0, 5).map((i) => ({
      id: i.id,
      title: i.title,
      score: 0.2,
    })),
    question:
      'Which assignment should I change? Open one in the outline, or name it (for example “Virtual Memory”).',
    selector: { scope: 'all' },
  };
}

function typesFromMessage(
  m: string,
): Array<'QUIZ' | 'DISCUSSION' | 'LESSON' | 'INTERACTIVE'> | null {
  const types = new Set<'QUIZ' | 'DISCUSSION' | 'LESSON' | 'INTERACTIVE'>();
  if (/\bquiz(zes)?\b/.test(m)) types.add('QUIZ');
  if (/\bdiscussion(s)?\b/.test(m)) types.add('DISCUSSION');
  if (/\blesson(s)?\b/.test(m)) types.add('LESSON');
  if (/\binteractive(s)?\b/.test(m)) types.add('INTERACTIVE');
  return types.size > 0 ? [...types] : null;
}

function filterPool(
  items: InventoryItem[],
  types: Array<'QUIZ' | 'DISCUSSION' | 'LESSON' | 'INTERACTIVE'> | null,
) {
  if (!types) return items;
  return items.filter((i) => types.includes(i.type));
}

const TITLE_STOP = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'into',
  'that',
  'this',
  'quiz',
  'discussion',
  'lesson',
  'interactive',
  'assignment',
]);

function titleScore(message: string, item: InventoryItem): number {
  const title = item.title.toLowerCase();
  if (!title) return 0;
  if (message.includes(title)) return 1;

  const titleTokens = title
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !TITLE_STOP.has(t));
  if (titleTokens.length === 0) return 0;

  // Prefer multi-word phrases from the title that appear in the prompt.
  for (let n = Math.min(titleTokens.length, 4); n >= 2; n -= 1) {
    for (let i = 0; i <= titleTokens.length - n; i += 1) {
      const phrase = titleTokens.slice(i, i + n).join(' ');
      if (message.includes(phrase)) {
        return Math.min(1, 0.7 + n * 0.08);
      }
    }
  }

  let hits = 0;
  for (const t of titleTokens) {
    if (message.includes(t)) hits += 1;
  }
  if (hits === 0) return 0;
  const overlap = hits / titleTokens.length;
  const mod = item.moduleTitle.toLowerCase();
  const modBonus =
    mod.length > 3 && message.includes(mod) ? 0.1 : 0;
  // A single distinctive token (e.g. "filesystem") should still win.
  const distinctive = hits === 1 && titleTokens[0] && titleTokens[0].length >= 8
    ? 0.55
    : 0;
  return Math.min(1, Math.max(overlap + modBonus, distinctive + (hits > 1 ? 0.2 : 0)));
}
