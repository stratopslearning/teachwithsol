import { runAuthoringAgent } from '@/lib/authoring/agent/run';
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
};

/**
 * Authoring chat entrypoint — grounded tool harness.
 * Side effects only via typed tools; replies templated from results.
 */
export async function refineOutlineChat(
  user: AuthUser,
  opts: {
    outlineId: string;
    message: string;
    focusItemId?: string;
    materialIds?: string[];
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<RefineChatResult> {
  return runAuthoringAgent(user, opts, audit);
}
