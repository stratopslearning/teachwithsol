import type { OutlineDetail, OutlineItemSummary } from '@/lib/authoring/outlines';

export function looksLikePublishRequest(message: string): boolean {
  const m = message.toLowerCase();
  if (
    /\b(don'?t|do not|never|without)\b.{0,24}\b(publish|submit)\b/.test(m) ||
    /\bunpublish\b/.test(m)
  ) {
    return false;
  }
  return /\b(publish|materialize|create drafts?|push to assignments?|submit)\b/.test(
    m,
  );
}

/** True when the user said submit (ambiguous: publish drafts or release). */
export function looksLikeSubmitRequest(message: string): boolean {
  return /\bsubmit\b/.test(message.toLowerCase());
}

export function looksLikeReleaseRequest(message: string): boolean {
  const m = message.toLowerCase();
  if (
    /\b(don'?t|do not|never|without)\b.{0,24}\b(release|go live)\b/.test(m) ||
    /\bunrelease\b|\bhide from students\b/.test(m)
  ) {
    return false;
  }
  return /\b(release|go live|make live|open to students|visible to students)\b/.test(
    m,
  );
}

/**
 * Add / upgrade Shah-style interactive LESSON chapters on each module.
 * Checked before add_item out-of-scope and before plain refine.
 */
export function looksLikeEnsureLessonsRequest(message: string): boolean {
  const m = message.toLowerCase().trim();
  if (!m) return false;
  return (
    /\b(interactive\s+(chapter|lesson)|shah[-\s]?style|lesson[-\s]?first)\b/.test(
      m,
    ) ||
    /\b(add|create|insert|ensure|upgrade|include|build)\b.{0,48}\b(interactive\s+)?lessons?\b/.test(
      m,
    ) ||
    /\blessons?\b.{0,40}\b(each|every|per)\s+module\b/.test(m) ||
    /\b(make|turn)\b.{0,40}\b(modules?|outline)\b.{0,40}\b(interactive\s+)?lessons?\b/.test(
      m,
    ) ||
    /\binteractive\s+lessons?\b.{0,24}\b(modules?|outline|course)\b/.test(m)
  );
}

/**
 * Fresh outline propose / regenerate — not an item refine.
 * “Propose an outline for Intro to SCM” must not become “which quiz?”.
 */
export function looksLikeProposeOutlineRequest(message: string): boolean {
  const m = message.toLowerCase().trim();
  if (!m) return false;
  if (looksLikeEnsureLessonsRequest(message)) return false;
  return (
    /\b(propose|generate|create|draft|build|make)\b.{0,48}\b(a |an |the |new |fresh )?(course )?outline\b/.test(
      m,
    ) ||
    /\b(re-?propose|regenerate|rebuild|replace)\b.{0,24}\boutline\b/.test(m) ||
    /\bnew outline\b/.test(m) ||
    /\boutline from (my |the )?materials?\b/.test(m)
  );
}

export function looksLikeRewriteRequest(message: string): boolean {
  const m = message.toLowerCase();
  if (looksLikeEnsureLessonsRequest(message)) return false;
  return (
    /rewrite|rephrase|harder|easier|new question|replace question|different question|regenerate quiz|redo the quiz|change the options|fix the stem/.test(
      m,
    ) ||
    /\b(make|improve|strengthen|clarify|polish|upgrade)\b.{0,60}\b(better|stronger|clearer|sharper)\b/.test(
      m,
    ) ||
    /\b(make|improve)\b.{0,40}\b(outline|module|quiz(zes)?|discussion(s)?|assignment(s)?|item(s)?)\b.{0,20}\b(better|stronger|clearer)?/.test(
      m,
    ) ||
    /\b(better|improve|strengthen)\b.{0,40}\b(outline|quiz(zes)?|discussion(s)?|assignment(s)?|module(s)?)\b/.test(
      m,
    )
  );
}

/**
 * Meta / help prompts ("what can you do") — not outline status or refine.
 * Keep narrower than /^what/ so "what quizzes are published" stays a status question.
 */
export function looksLikeHelpOrCapabilitiesRequest(message: string): boolean {
  const m = message.toLowerCase().trim();
  if (!m) return false;
  // Explicit outline-status questions win over help phrasing.
  if (
    /\b(how many|published|unpublished|drafts?|outline|quiz(zes)?|discussion|module|assignment)\b/.test(
      m,
    ) &&
    !/\b(can you|could you|are you able|help me|what do you)\b/.test(m)
  ) {
    return false;
  }
  return (
    /\bwhat (things |else )?(can|could|do) you (do|help|handle|support)\b/.test(
      m,
    ) ||
    /\bwhat are you (able|good) (to do|at)\b/.test(m) ||
    /\b(how can you help|how do (i|you) use (you|this)|what(?:'s| is) your (job|role))\b/.test(
      m,
    ) ||
    /^(help|capabilities|commands|what now)\??$/.test(m) ||
    /\b(list|show) (your )?(capabilities|commands|what you can do)\b/.test(m)
  );
}

export function looksLikeScheduleRequest(message: string): boolean {
  return /due date|start date|end date|opens|timing|time limit|timelimit|schedule|deadline|attempts|passing score|pass %|points|minutes/.test(
    message.toLowerCase(),
  );
}

function isAlreadyPublished(item: OutlineItemSummary): boolean {
  return Boolean(
    item.publishedQuizId ||
      item.publishedChatbotId ||
      item.publishedLessonId ||
      item.publishedInteractiveId,
  );
}

function typeFilterFromMessage(
  message: string,
): Set<OutlineItemSummary['type']> | null {
  const m = message.toLowerCase();
  const types = new Set<OutlineItemSummary['type']>();
  if (/\bquiz(zes)?\b/.test(m)) types.add('QUIZ');
  if (/\bdiscussion(s)?\b/.test(m)) types.add('DISCUSSION');
  if (/\blesson(s)?\b/.test(m)) types.add('LESSON');
  if (/\binteractive(s)?\b/.test(m)) types.add('INTERACTIVE');
  if (types.size === 0) return null;
  return types;
}

const WORD_COUNTS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function parseCountToken(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 40) : null;
  }
  return WORD_COUNTS[t] ?? null;
}

/**
 * Parse quantity limits like "first three", "last 2", "only 5 quizzes".
 * Returns null when the user means everything in scope.
 */
export function parseQuantityLimit(message: string): {
  count: number;
  fromEnd: boolean;
} | null {
  const m = message.toLowerCase();
  if (/\ball\b|\bevery\b|\bentire\b|\bwhole\b/.test(m)) return null;

  const first = m.match(
    /\b(?:first|top|next|opening)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/,
  );
  if (first?.[1]) {
    const count = parseCountToken(first[1]);
    if (count) return { count, fromEnd: false };
  }

  const last = m.match(
    /\b(?:last|final|bottom|ending)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/,
  );
  if (last?.[1]) {
    const count = parseCountToken(last[1]);
    if (count) return { count, fromEnd: true };
  }

  const only = m.match(
    /\b(?:only|just)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/,
  );
  if (only?.[1]) {
    const count = parseCountToken(only[1]);
    if (count) return { count, fromEnd: false };
  }

  // "release 3 quizzes" / "publish three quizzes"
  const nType = m.match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:quizzes|quiz|discussions|discussion|lessons|lesson|interactives|interactive|assignments|items)\b/,
  );
  if (nType?.[1] && !/\bfirst\b|\blast\b|\bnext\b|\bonly\b|\bjust\b/.test(m)) {
    const count = parseCountToken(nType[1]);
    if (count) return { count, fromEnd: false };
  }

  return null;
}

function applyQuantityLimit(ids: string[], message: string): string[] {
  const limit = parseQuantityLimit(message);
  if (!limit) return ids;
  if (limit.fromEnd) return ids.slice(-limit.count);
  return ids.slice(0, limit.count);
}

function wantsBroadScope(message: string): boolean {
  return /\ball\b|\bevery\b|\bmodules?\b|\bentire\b|\bwhole\b/.test(
    message.toLowerCase(),
  );
}

/** Course order: modules then items (as returned on the outline). */
function allItems(detail: OutlineDetail): OutlineItemSummary[] {
  return detail.modules.flatMap((mod) => mod.items);
}

export function titlesForItemIds(
  detail: OutlineDetail,
  itemIds: string[],
): string[] {
  const byId = new Map(
    allItems(detail).map((item) => [item.id, item.title] as const),
  );
  return itemIds.map((id) => byId.get(id) ?? 'Assignment');
}

/**
 * Choose outline items for chat-driven publish.
 * Prefer focused item unless the user clearly asked for all/modules/N items.
 */
export function selectPublishTargetIds(
  detail: OutlineDetail,
  message: string,
  focusItemId?: string,
): string[] {
  const items = allItems(detail);
  const broad = wantsBroadScope(message);
  const quantity = parseQuantityLimit(message);
  const types = typeFilterFromMessage(message);

  if (focusItemId && !broad && !quantity) {
    const focus = items.find((i) => i.id === focusItemId);
    if (focus && !isAlreadyPublished(focus)) {
      if (!types || types.has(focus.type)) return [focus.id];
    }
  }

  const ids = items
    .filter((i) => !isAlreadyPublished(i))
    .filter((i) => !types || types.has(i.type))
    .map((i) => i.id);
  return applyQuantityLimit(ids, message);
}

/** Choose already-published items for chat-driven student release. */
export function selectReleaseTargetIds(
  detail: OutlineDetail,
  message: string,
  focusItemId?: string,
): string[] {
  const items = allItems(detail);
  const broad = wantsBroadScope(message);
  const quantity = parseQuantityLimit(message);
  const types = typeFilterFromMessage(message);

  if (focusItemId && !broad && !quantity) {
    const focus = items.find((i) => i.id === focusItemId);
    if (focus && isAlreadyPublished(focus)) {
      if (!types || types.has(focus.type)) return [focus.id];
    }
  }

  const ids = items
    .filter((i) => isAlreadyPublished(i))
    .filter((i) => !types || types.has(i.type))
    .map((i) => i.id);
  return applyQuantityLimit(ids, message);
}

/**
 * Outline items a refine/schedule/rewrite prompt is most likely about.
 * Includes published drafts (unlike publish selection).
 */
export function selectRefineTargetIds(
  detail: OutlineDetail,
  message: string,
  focusItemId?: string,
): string[] {
  const items = allItems(detail);
  const broad = wantsBroadScope(message);
  const quantity = parseQuantityLimit(message);
  const types = typeFilterFromMessage(message);

  if (focusItemId && !broad && !quantity) {
    const focus = items.find((i) => i.id === focusItemId);
    if (focus && (!types || types.has(focus.type))) return [focus.id];
  }

  const ids = items
    .filter((i) => !types || types.has(i.type))
    .map((i) => i.id);
  return applyQuantityLimit(ids, message);
}

export type ChatProgressPlan = {
  idleLabel: string;
  steps: string[];
};

/** Concrete status steps for any authoring chat prompt (same pattern for all intents). */
export function buildChatProgressPlan(
  detail: OutlineDetail,
  message: string,
  focusItemId?: string,
): ChatProgressPlan {
  if (looksLikeHelpOrCapabilitiesRequest(message)) {
    return {
      idleLabel: 'Explaining what I can help with…',
      steps: ['Reviewing authoring capabilities'],
    };
  }

  const m = message.toLowerCase();
  if (
    /\b(too hard|too easy|should i|recommend|what should i|pedagog|undergrad)\b/.test(
      m,
    )
  ) {
    return {
      idleLabel: 'Thinking through teaching advice…',
      steps: ['Reviewing the outline', 'Checking materials', 'Drafting advice'],
    };
  }
  if (
    /\b(unpublish|delete|remove|reorder|add (a )?new|email students|grade)\b/.test(
      m,
    )
  ) {
    return {
      idleLabel: 'Checking what I can do…',
      steps: ['Checking supported actions'],
    };
  }

  const wantsPublish = looksLikePublishRequest(message);
  const wantsRelease = looksLikeReleaseRequest(message);
  const wantsRewrite = looksLikeRewriteRequest(message);
  const wantsSchedule = looksLikeScheduleRequest(message) && !wantsRewrite;

  // Prefer release over publish when both words appear ("publish and release").
  // Quantity applies to each selection independently.
  if (wantsPublish || wantsRelease) {
    const publishIds = wantsPublish
      ? selectPublishTargetIds(detail, message, focusItemId)
      : [];
    const releaseIds = wantsRelease
      ? selectReleaseTargetIds(detail, message, focusItemId)
      : [];
    const steps = [
      ...titlesForItemIds(detail, publishIds).map(
        (title) => `Publishing “${title}”`,
      ),
      ...titlesForItemIds(detail, releaseIds).map(
        (title) => `Releasing “${title}”`,
      ),
    ];
    return {
      idleLabel: wantsPublish
        ? 'Checking what can still be published…'
        : 'Checking what can be released…',
      steps,
    };
  }

  const targetIds = selectRefineTargetIds(detail, message, focusItemId);
  const titles = titlesForItemIds(detail, targetIds);
  const verb = wantsRewrite
    ? 'Reworking'
    : wantsSchedule
      ? 'Updating schedule for'
      : 'Updating';

  return {
    idleLabel: wantsRewrite
      ? 'Reworking assignment content…'
      : wantsSchedule
        ? 'Updating schedule…'
        : 'Updating the outline…',
    steps: titles.map((title) => `${verb} “${title}”`),
  };
}
