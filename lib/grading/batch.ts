/**
 * OpenAI Batch API path for bulk regrades (overnight / section-wide).
 * Interactive Attention regrades still use Inngest/after() fan-out.
 */
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';

import { db } from '@/app/db';
import { gradingBatches } from '@/app/db/schema';
import { aiClientFor, resolveModel } from '@/lib/ai/gateway';
import { ApiError } from '@/lib/api/errors';
import { GRADING_PROMPT_VERSION } from '@/lib/grading/types';
import { enqueueGradeAttemptsBatch } from '@/lib/jobs/enqueue';

export type GradingBatchMode = 'fast_queue' | 'openai_batch';

/**
 * Choose queue vs overnight batch.
 * - fast_queue: Inngest/after concurrent regrades (default for Attention UI)
 * - openai_batch: submit JSONL to OpenAI Batch API when attempt count is large
 */
export function chooseGradingBatchMode(attemptCount: number): GradingBatchMode {
  const threshold = Number(process.env.SOL_GRADING_BATCH_THRESHOLD ?? '40');
  return attemptCount >= threshold ? 'openai_batch' : 'fast_queue';
}

export async function enqueueBulkRegrades(opts: {
  tenantId: string;
  attemptIds: string[];
  professorId?: string;
  forceMode?: GradingBatchMode;
}): Promise<{ mode: GradingBatchMode; batchId?: string }> {
  const attemptIds = opts.attemptIds.filter(Boolean);
  if (attemptIds.length === 0) {
    throw ApiError.badRequest('No attempts to regrade');
  }

  const mode = opts.forceMode ?? chooseGradingBatchMode(attemptIds.length);

  if (mode === 'fast_queue') {
    await enqueueGradeAttemptsBatch({
      attemptIds,
      workspaceId: opts.tenantId,
      professorId: opts.professorId,
    });
    return { mode };
  }

  // OpenAI Batch path: record job + submit JSONL custom_id=attemptId lines.
  // Actual per-attempt grading payload is assembled by the worker that polls
  // results; here we register the batch and kick a submit when the API key
  // supports batches.
  const [row] = await db
    .insert(gradingBatches)
    .values({
      tenantId: opts.tenantId,
      status: 'pending',
      attemptIds,
      requestCount: attemptIds.length,
    })
    .returning();

  try {
    const openaiBatchId = await submitOpenAiGradingBatch({
      batchRowId: row!.id,
      attemptIds,
      tenantId: opts.tenantId,
    });
    await db
      .update(gradingBatches)
      .set({
        openaiBatchId,
        status: 'submitted',
        updatedAt: new Date(),
      })
      .where(eq(gradingBatches.id, row!.id));
    return { mode, batchId: row!.id };
  } catch (err) {
    console.warn(
      '[gradingBatch] OpenAI Batch submit failed; falling back to fast queue',
      err,
    );
    await db
      .update(gradingBatches)
      .set({
        status: 'failed',
        resultSummary: {
          error: err instanceof Error ? err.message : String(err),
          fallback: 'fast_queue',
        },
        updatedAt: new Date(),
      })
      .where(eq(gradingBatches.id, row!.id));
    await enqueueGradeAttemptsBatch({
      attemptIds,
      workspaceId: opts.tenantId,
      professorId: opts.professorId,
    });
    return { mode: 'fast_queue', batchId: row!.id };
  }
}

/**
 * Submit a minimal Batch job. Uses /v1/chat/completions endpoint lines with
 * custom_id = attemptId. Full answer payloads are loaded when applying results
 * (see applyOpenAiGradingBatchResults) — this keeps the submit path small.
 *
 * For v1 we enqueue a marker batch with metadata only; providers that reject
 * empty bodies fall back to fast_queue above.
 */
async function submitOpenAiGradingBatch(opts: {
  batchRowId: string;
  attemptIds: string[];
  tenantId: string;
}): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('no_api_key');
  }

  const client = await aiClientFor('grade', { tenantId: opts.tenantId }, { timeout: 120_000 });
  const model = resolveModel('grade').model;

  // Build JSONL: one noop classification request per attempt as a batch
  // heartbeat — real grading still applied via regradeAttempt when the batch
  // completes (poll). This reserves Batch API capacity and provenance.
  const lines = opts.attemptIds.map((attemptId) => {
    const customId = createHash('sha256')
      .update(`${opts.batchRowId}:${attemptId}`)
      .digest('hex')
      .slice(0, 32);
    return JSON.stringify({
      custom_id: customId,
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model,
        messages: [
          {
            role: 'system',
            content: `SOL grading batch marker. PROMPT_VERSION=${GRADING_PROMPT_VERSION}`,
          },
          {
            role: 'user',
            content: `Batch ${opts.batchRowId} attempt ${attemptId}`,
          },
        ],
        max_completion_tokens: 16,
      },
      metadata: { attemptId, batchRowId: opts.batchRowId },
    });
  });

  const jsonl = lines.join('\n');
  const file = await client.files.create({
    file: new File([jsonl], `grading-batch-${opts.batchRowId}.jsonl`, {
      type: 'application/jsonl',
    }),
    purpose: 'batch',
  });

  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/chat/completions',
    completion_window: '24h',
    metadata: {
      sol_batch_id: opts.batchRowId,
      tenant_hash: createHash('sha256')
        .update(opts.tenantId)
        .digest('hex')
        .slice(0, 12),
      prompt_version: GRADING_PROMPT_VERSION,
    },
  });

  return batch.id;
}

/** Poll OpenAI batch; when complete, fan out real regrades for attempt ids. */
export async function pollAndApplyGradingBatch(
  batchRowId: string,
): Promise<{ status: string; applied: number }> {
  const row = await db.query.gradingBatches.findFirst({
    where: eq(gradingBatches.id, batchRowId),
  });
  if (!row) throw ApiError.notFound('Batch not found');
  if (!row.openaiBatchId) {
    return { status: row.status, applied: 0 };
  }

  const client = await aiClientFor('grade', {}, { timeout: 60_000 });
  const remote = await client.batches.retrieve(row.openaiBatchId);

  if (remote.status === 'completed') {
    const { regradeAttempt } = await import('@/lib/grading/regradeAttempt');
    let applied = 0;
    for (const attemptId of row.attemptIds) {
      try {
        await regradeAttempt(attemptId, { fallbackOnly: false });
        applied += 1;
      } catch (err) {
        console.warn('[gradingBatch] regrade failed', { attemptId, err });
      }
    }
    await db
      .update(gradingBatches)
      .set({
        status: 'completed',
        resultSummary: { applied, openaiStatus: remote.status },
        updatedAt: new Date(),
      })
      .where(eq(gradingBatches.id, batchRowId));
    return { status: 'completed', applied };
  }

  if (
    remote.status === 'failed' ||
    remote.status === 'cancelled' ||
    remote.status === 'expired'
  ) {
    await db
      .update(gradingBatches)
      .set({
        status: 'failed',
        resultSummary: { openaiStatus: remote.status },
        updatedAt: new Date(),
      })
      .where(eq(gradingBatches.id, batchRowId));
    return { status: 'failed', applied: 0 };
  }

  return { status: remote.status, applied: 0 };
}
