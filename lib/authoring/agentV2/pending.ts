/**
 * Actions the agent proposed but must not run until the professor confirms
 * (anything students see, bulk changes, deletes, restores).
 *
 * The pending action rides along in the assistant message as an HTML comment
 * (like the existing last-action marker). It is only valid while it sits on
 * the most recent assistant message, so any later turn cancels it implicitly.
 */
export const WRITE_TOOLS = [
  'edit_items',
  'create_item',
  'create_module',
  'delete_item',
  'set_schedule',
  'publish_items',
  'release_items',
  'restore_revision',
  'add_interactive_lessons',
] as const;

export type WriteToolName = (typeof WRITE_TOOLS)[number];

export type PendingCall = {
  tool: WriteToolName;
  args: Record<string, unknown>;
  /** One human line, e.g. "Release 3 quizzes: A, B, C". */
  summary: string;
};

export type PendingAction = {
  calls: PendingCall[];
  createdAt: string;
};

const MARKER_RE = /\n?<!--sol-pending:([A-Za-z0-9+/=]+)-->/;

export function withPendingMarker(content: string, pending: PendingAction | null): string {
  if (!pending || pending.calls.length === 0) return content;
  const encoded = Buffer.from(JSON.stringify(pending), 'utf8').toString('base64');
  return `${content}\n<!--sol-pending:${encoded}-->`;
}

export function readPendingMarker(content: string): PendingAction | null {
  const m = MARKER_RE.exec(content);
  if (!m) return null;
  try {
    const parsed = JSON.parse(Buffer.from(m[1]!, 'base64').toString('utf8')) as PendingAction;
    if (!Array.isArray(parsed.calls)) return null;
    const calls = parsed.calls.filter((c) => (WRITE_TOOLS as readonly string[]).includes(c.tool));
    return calls.length > 0 ? { calls, createdAt: parsed.createdAt } : null;
  } catch {
    return null;
  }
}

export function stripPendingMarker(content: string): string {
  return content.replace(MARKER_RE, '');
}

/** Pending action on the latest assistant message, if any. */
export function latestPending(
  history: Array<{ role: string; content: string }>,
): PendingAction | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]!;
    if (h.role === 'assistant') return readPendingMarker(h.content);
  }
  return null;
}

/** Bulk threshold: changes to more than this many items need confirmation. */
export const BULK_LIMIT = 3;

/**
 * Does this write need the professor's confirmation first?
 * - always: release (students see it), delete, restore, interactive-lesson rebuilds
 * - when bulk (> BULK_LIMIT items) or touching already-published items: edits, schedules
 * - publish (creates inactive drafts students can't see) only when bulk
 * - create_item / create_module never (they add drafts; undo restores)
 */
export function needsConfirmation(
  tool: WriteToolName,
  targets: { count: number; anyPublished: boolean },
): boolean {
  switch (tool) {
    case 'release_items':
    case 'delete_item':
    case 'restore_revision':
    case 'add_interactive_lessons':
      return true;
    case 'edit_items':
    case 'set_schedule':
      return targets.count > BULK_LIMIT || targets.anyPublished;
    case 'publish_items':
      return targets.count > BULK_LIMIT;
    case 'create_item':
    case 'create_module':
      return false;
  }
}
