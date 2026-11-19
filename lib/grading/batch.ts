/**
 * Bulk regrades (Attention "regrade all").
 *
 * Every attempt becomes one `regrade_attempt` job on the durable queue
 * (lib/jobs/queue.ts), drained by up to three workers side by side. There used
 * to be an OpenAI Batch API path for 40+ attempts, but nothing ever polled the
 * batch, so those regrades were never applied (#141).
 */
import { ApiError } from '@/lib/api/errors';
import { enqueueGradeAttemptsBatch } from '@/lib/jobs/enqueue';

export type GradingBatchMode = 'fast_queue';

export async function enqueueBulkRegrades(opts: {
  tenantId: string;
  attemptIds: string[];
  professorId?: string;
}): Promise<{ mode: GradingBatchMode; batchId?: string }> {
  const attemptIds = opts.attemptIds.filter(Boolean);
  if (attemptIds.length === 0) {
    throw ApiError.badRequest('No attempts to regrade');
  }
  await enqueueGradeAttemptsBatch({
    attemptIds,
    workspaceId: opts.tenantId,
    professorId: opts.professorId,
  });
  return { mode: 'fast_queue' };
}
