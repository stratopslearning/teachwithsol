export type AuthoringLastAction = {
  tools: string[];
  itemIds: string[];
  instruction?: string;
  at: string;
};

const MARKER_RE = /<!--sol-last-action:([A-Za-z0-9+/=]+)-->/;

export function encodeLastActionMarker(action: AuthoringLastAction): string {
  const json = JSON.stringify(action);
  const b64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(json, 'utf8').toString('base64')
      : btoa(unescape(encodeURIComponent(json)));
  return `<!--sol-last-action:${b64}-->`;
}

/** Agent v2 pending-confirmation marker (lib/authoring/agentV2/pending.ts). */
const PENDING_MARKER_RE = /\n?<!--sol-pending:[A-Za-z0-9+/=]+-->/;

/** Remove the hidden agent markers before showing a message. */
export function stripLastActionMarker(content: string): string {
  return content.replace(MARKER_RE, '').replace(PENDING_MARKER_RE, '').trimEnd();
}

export function parseLastActionMarker(
  content: string,
): AuthoringLastAction | null {
  const match = MARKER_RE.exec(content);
  if (!match?.[1]) return null;
  try {
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(match[1], 'base64').toString('utf8')
        : decodeURIComponent(escape(atob(match[1])));
    const parsed = JSON.parse(json) as AuthoringLastAction;
    if (!parsed || !Array.isArray(parsed.tools) || !Array.isArray(parsed.itemIds)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Walk recent assistant messages newest-first for the last structured action. */
export function findLastActionInHistory(
  history: Array<{ role: string; content: string }>,
): AuthoringLastAction | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i];
    if (row?.role !== 'assistant') continue;
    const action = parseLastActionMarker(row.content);
    if (action) return action;
  }
  return null;
}

export function withLastActionMarker(
  reply: string,
  action: AuthoringLastAction | null,
): string {
  if (!action || action.itemIds.length === 0 && action.tools.length === 0) {
    return reply;
  }
  return `${reply.trimEnd()}\n${encodeLastActionMarker(action)}`;
}
