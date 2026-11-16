import { and, eq, isNotNull, lt } from 'drizzle-orm';

import { listAllTenantIds } from '@/lib/db/allTenants';
import { withTenant } from '@/lib/db/tenantContext';
import { attempts, chatbotSessions, workspaces } from '@/app/db/schema';

export type RetentionRunResult = {
  skipped: boolean;
  reason?: string;
  deletedSessions: number;
  clearedGptFeedback: number;
};

function workspaceRetentionDays(settings: Record<string, unknown>): number | null {
  const days = Number(settings.retentionDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

function shouldPurgeGptFeedback(settings: Record<string, unknown>): boolean {
  if (settings.purgeGptFeedbackTranscripts === false) return false;
  return settings.purgeGptFeedbackTranscripts === true;
}

/**
 * Delete chatbot sessions older than workspace.settings.retentionDays.
 * Optionally null `attempts.gpt_feedback` for submitted attempts in the same window
 * when workspace.settings.purgeGptFeedbackTranscripts is true.
 * Skips workspaces without a positive retentionDays value.
 */
export async function runChatbotSessionRetention(opts?: {
  workspaceId?: string;
}): Promise<RetentionRunResult> {
  // FORCE RLS: plain db reads saw no workspaces and deletes matched nothing,
  // so retention never ran. Visit each workspace under its own tenant.
  const workspaceIds = opts?.workspaceId
    ? [opts.workspaceId]
    : await listAllTenantIds();

  let deletedSessions = 0;
  let clearedGptFeedback = 0;
  let anyRetentionConfigured = false;

  for (const workspaceId of workspaceIds) {
    await withTenant(workspaceId, null, async (tx) => {
      const ws = await tx.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
        columns: { id: true, settings: true },
      });
      if (!ws) return;
      const settings = (ws.settings ?? {}) as Record<string, unknown>;
      const days = workspaceRetentionDays(settings);
      if (days === null) return;
      anyRetentionConfigured = true;

      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const sessionResult = await tx
        .delete(chatbotSessions)
        .where(
          and(
            eq(chatbotSessions.tenantId, ws.id),
            lt(chatbotSessions.startedAt, cutoff),
          ),
        )
        .returning({ id: chatbotSessions.id });
      deletedSessions += sessionResult.length;

      if (shouldPurgeGptFeedback(settings)) {
        const attemptResult = await tx
          .update(attempts)
          .set({ gptFeedback: null })
          .where(
            and(
              eq(attempts.tenantId, ws.id),
              isNotNull(attempts.submittedAt),
              lt(attempts.submittedAt, cutoff),
              isNotNull(attempts.gptFeedback),
            ),
          )
          .returning({ id: attempts.id });
        clearedGptFeedback += attemptResult.length;
      }
    });
  }

  if (!anyRetentionConfigured) {
    return {
      skipped: true,
      reason: 'no_retention_days_configured',
      deletedSessions: 0,
      clearedGptFeedback: 0,
    };
  }

  return { skipped: false, deletedSessions, clearedGptFeedback };
}
