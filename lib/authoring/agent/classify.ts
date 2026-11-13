import type { OutlineInventory } from '@/lib/authoring/agent/inventory';
import type { AuthoringLastAction } from '@/lib/authoring/agent/lastAction';
import {
  looksLikeEnsureLessonsRequest,
  looksLikeHelpOrCapabilitiesRequest,
  looksLikePublishRequest,
  looksLikeReleaseRequest,
  looksLikeRewriteRequest,
  looksLikeScheduleRequest,
  looksLikeSubmitRequest,
} from '@/lib/authoring/intent';

export type AuthoringIntentKind =
  | 'act'
  | 'status'
  | 'help'
  | 'advise'
  | 'clarify'
  | 'out_of_scope'
  | 'repeat'
  | 'undo';

export type OutOfScopeAction =
  | 'unpublish'
  | 'add_item'
  | 'delete_item'
  | 'reorder'
  | 'set_brief'
  | 'grade'
  | 'email'
  | 'other';

export type AuthoringIntent = {
  kind: AuthoringIntentKind;
  /** 0–1 heuristic confidence */
  confidence: number;
  reason: string;
  outOfScope?: OutOfScopeAction;
  /** For act: which verbs were detected */
  verbs?: Array<
    | 'publish'
    | 'release'
    | 'schedule'
    | 'refine'
    | 'restore'
    | 'ensure_lessons'
  >;
};

const OUT_OF_SCOPE_PATTERNS: Array<{
  action: OutOfScopeAction;
  re: RegExp;
}> = [
  {
    action: 'unpublish',
    re: /\b(unpublish|un-?release|hide from students|make inactive|take down)\b/i,
  },
  {
    action: 'add_item',
    re: /\b(add|create|insert|new)\b.{0,40}\b(quiz|discussion|lesson|interactive|assignment|item)\b/i,
  },
  {
    action: 'delete_item',
    re: /\b(delete|remove|drop)\b.{0,40}\b(quiz|discussion|lesson|interactive|assignment|item|module)\b/i,
  },
  {
    action: 'reorder',
    re: /\b(reorder|re-?order|move|swap)\b.{0,40}\b(quiz|discussion|item|module|assignment)s?\b/i,
  },
  {
    action: 'set_brief',
    re: /\b(set|update|change|edit)\b.{0,24}\bbrief\b/i,
  },
  {
    action: 'grade',
    re: /\b(grade|grading|score attempts|rubric grade)\b/i,
  },
  {
    action: 'email',
    re: /\b(email|notify|message)\b.{0,24}\bstudents?\b/i,
  },
];

export function classifyAuthoringIntent(
  message: string,
  opts?: {
    inventory?: OutlineInventory;
    lastAction?: AuthoringLastAction | null;
  },
): AuthoringIntent {
  const raw = message.trim();
  const m = raw.toLowerCase();
  if (!m) {
    return { kind: 'clarify', confidence: 1, reason: 'empty message' };
  }

  if (
    opts?.lastAction &&
    /\b(do that again|same (thing|again)|repeat that|again for the (rest|others|remaining))\b/i.test(
      m,
    )
  ) {
    return { kind: 'repeat', confidence: 0.95, reason: 'repeat last action' };
  }

  if (
    /\b(undo|revert( that| this| last)?|restore (the )?(last|previous)|roll ?back)\b/i.test(
      m,
    )
  ) {
    return { kind: 'undo', confidence: 0.9, reason: 'undo / restore' };
  }

  if (looksLikeHelpOrCapabilitiesRequest(raw)) {
    return { kind: 'help', confidence: 0.98, reason: 'capabilities' };
  }

  // Interactive-lesson upgrade is supported — do not treat as add_item.
  if (looksLikeEnsureLessonsRequest(raw)) {
    return {
      kind: 'act',
      confidence: 0.95,
      reason: 'ensure interactive lessons',
      verbs: ['ensure_lessons'],
    };
  }

  // Outline-wide improve on a quiz-only skeleton → add Shah lessons first.
  const missingLessons =
    (opts?.inventory?.counts.byType.LESSON ?? 0) === 0 &&
    (opts?.inventory?.counts.total ?? 0) > 0;
  if (
    missingLessons &&
    /\b(make|improve)\b.{0,40}\boutline\b.{0,20}\b(better|stronger|clearer)?/.test(
      m,
    )
  ) {
    return {
      kind: 'act',
      confidence: 0.9,
      reason: 'outline improve without lessons',
      verbs: ['ensure_lessons'],
    };
  }

  for (const { action, re } of OUT_OF_SCOPE_PATTERNS) {
    if (re.test(raw)) {
      // "create drafts" is publish language, not add_item
      if (
        action === 'add_item' &&
        /\b(create drafts?|publish|materialize)\b/i.test(m)
      ) {
        continue;
      }
      return {
        kind: 'out_of_scope',
        confidence: 0.92,
        reason: `unsupported:${action}`,
        outOfScope: action,
      };
    }
  }

  if (looksLikeAdviseRequest(raw)) {
    return { kind: 'advise', confidence: 0.85, reason: 'pedagogy / judgment' };
  }

  if (looksLikeStatusRequest(raw)) {
    return { kind: 'status', confidence: 0.9, reason: 'outline status' };
  }

  const verbs: AuthoringIntent['verbs'] = [];
  if (looksLikePublishRequest(raw) || looksLikeSubmitRequest(raw)) {
    verbs.push('publish');
  }
  if (looksLikeReleaseRequest(raw)) verbs.push('release');
  if (looksLikeScheduleRequest(raw) && !looksLikeRewriteRequest(raw)) {
    verbs.push('schedule');
  }
  if (looksLikeRewriteRequest(raw)) verbs.push('refine');
  if (looksLikeEnsureLessonsRequest(raw)) verbs.push('ensure_lessons');
  if (/\b(restore|rollback)\b.{0,24}\brevision\b/i.test(m)) {
    verbs.push('restore');
  }

  if (verbs.length > 0) {
    return {
      kind: 'act',
      confidence: 0.9,
      reason: `verbs:${verbs.join(',')}`,
      verbs,
    };
  }

  // Deictic / vague act without verb → clarify rather than refine-all
  if (looksLikeVagueAct(raw)) {
    return {
      kind: 'clarify',
      confidence: 0.8,
      reason: 'vague request',
    };
  }

  // Default: if it looks like a question, status-ish answer; else refine only when
  // there is a clear content instruction, otherwise clarify.
  if (/\?$/.test(raw) || /^(what|which|how|why|who|where)\b/i.test(raw)) {
    return { kind: 'status', confidence: 0.7, reason: 'question fallback' };
  }

  if (opts?.inventory?.focus && looksLikeFocusedEdit(raw)) {
    return {
      kind: 'act',
      confidence: 0.75,
      reason: 'focused edit',
      verbs: ['refine'],
    };
  }

  if (looksLikeContentEdit(raw)) {
    return {
      kind: 'act',
      confidence: 0.7,
      reason: 'content edit',
      verbs: ['refine'],
    };
  }

  return {
    kind: 'clarify',
    confidence: 0.65,
    reason: 'ambiguous',
  };
}

function looksLikeAdviseRequest(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /\b(too hard|too easy|is this (good|enough|ready)|should i|what should i|recommend|advice|pedagog|difficulty for|undergrad|graduate students?)\b/.test(
      m,
    ) ||
    /\b(module order|assessment plan|course design|learning objective)\b/.test(
      m,
    )
  );
}

function looksLikeStatusRequest(message: string): boolean {
  const m = message.toLowerCase().trim();
  if (looksLikeHelpOrCapabilitiesRequest(message)) return false;
  if (looksLikeAdviseRequest(message)) return false;
  return (
    /\b(how many|what(?:'s| is) (published|unpublished|left|ready)|list (the )?(quizzes|discussions|items|assignments)|show (me )?(the )?outline|status|what'?s left)\b/.test(
      m,
    ) ||
    /^(what|which|how many|list|show|status)\b/.test(m)
  );
}

function looksLikeVagueAct(message: string): boolean {
  const m = message.toLowerCase().trim();
  return /^(ok(ay)?|go|continue|next|do it|fix it|make it better|update it|same|sure|please|thanks|thank you)[!?.]*$/i.test(
    m,
  );
}

function looksLikeFocusedEdit(message: string): boolean {
  return /\b(make|rewrite|fix|update|change|improve|clarify|shorten|expand)\b/i.test(
    message,
  );
}

function looksLikeContentEdit(message: string): boolean {
  return /\b(make|rewrite|fix|update|change|improve|clarify|rephrase|harder|easier|better|strengthen|polish)\b.{0,80}\b(quiz(zes)?|discussion(s)?|question(s)?|stem|option(s)?|prompt(s)?|assignment(s)?|outline|module(s)?|item(s)?)\b/i.test(
    message,
  );
}
