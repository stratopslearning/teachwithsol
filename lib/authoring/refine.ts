import { runAuthoringAgent } from '@/lib/authoring/agent/run';
import { runAuthoringAgentV2 } from '@/lib/authoring/agentV2/loop';
import type { OutlineDetail } from '@/lib/authoring/outlines';
import type { AuthUser } from '@/lib/getOrCreateUser';

export type RefineChatResult = {
  assistantMessage: string;
  outline: OutlineDetail;
  patchedItemIds: string[];
  publishedItemIds?: string[];
  releasedItemIds?: string[];
  publishFailed?: Array<{
    itemId: string;
    title: string | null;
    error: string;
  }>;
  /** The reply asks the professor to confirm these before they run. */
  pendingAction?: { summaries: string[] };
};

/**
 * Authoring chat entrypoint. The tool-calling agent (v2) is the default;
 * AUTHORING_AGENT_V1=1 falls back to the old classifier + planner.
 */
export async function refineOutlineChat(
  user: AuthUser,
  opts: {
    outlineId: string;
    message: string;
    focusItemId?: string;
    materialIds?: string[];
    confirmPending?: boolean;
    cancelPending?: boolean;
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<RefineChatResult> {
  if (process.env.AUTHORING_AGENT_V1 === '1') {
    return runAuthoringAgent(user, opts, audit);
  }
  return runAuthoringAgentV2(user, opts, audit);
}
