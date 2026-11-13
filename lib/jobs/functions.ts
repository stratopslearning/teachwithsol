import { withTenant } from '@/lib/db/tenantContext';
import { requireSafeRuntimeRole } from '@/lib/db/assertRuntimeRole';
import { processBook } from '@/lib/books/process';
import { gradePendingForAttemptId } from '@/lib/pendingGrader';
import { processMaterial } from '@/lib/knowledge/process';
import { processPendingPassbackJobs } from '@/lib/lti/passback';
import { regradeAttempt } from '@/lib/regradeAttempt';

import { inngest } from '@/lib/jobs/client';

/** Once per process: refuse workers if DATABASE_URL role is unsafe. */
let runtimeRoleReady: Promise<void> | undefined;
async function ensureWorkerRuntimeRole(): Promise<void> {
  if (!runtimeRoleReady) {
    runtimeRoleReady = requireSafeRuntimeRole().then(() => undefined);
  }
  await runtimeRoleReady;
}

/**
 * Short-answer grading for one attempt.
 * Global OpenAI-ish pool + per-tenant cap for multi-tenant fairness.
 */
export const gradeAttemptFn = inngest.createFunction(
  {
    id: 'grade-attempt',
    retries: 3,
    // Inngest free/hobby plan caps concurrency at 5 — higher values fail app sync.
    concurrency: [
      { limit: 5 },
      { key: 'event.data.tenantId', limit: 3 },
    ],
  },
  { event: 'grading/attempt.requested' },
  async ({ event, step }) => {
    await ensureWorkerRuntimeRole();
    const attemptId = event.data.attemptId;
    const tenantId = event.data.tenantId ?? event.data.workspaceId;
    const result = await step.run('grade-pending', async () => {
      if (tenantId) {
        return withTenant(tenantId, null, async () =>
          gradePendingForAttemptId(attemptId),
        );
      }
      return gradePendingForAttemptId(attemptId);
    });
    return result;
  },
);

/** Bulk Attention regrade — runs `regradeAttempt` per id with step isolation. */
export const gradeAttemptsBatchFn = inngest.createFunction(
  {
    id: 'grade-attempts-batch',
    retries: 2,
    concurrency: [
      { limit: 5 },
      { key: 'event.data.tenantId', limit: 3 },
    ],
  },
  { event: 'grading/attempts.batch.requested' },
  async ({ event, step }) => {
    const { attemptIds } = event.data;
    let regraded = 0;
    let stillPending = 0;
    let errors = 0;
    for (const attemptId of attemptIds) {
      const outcome = await step.run(`regrade-${attemptId}`, async () => {
        try {
          return await regradeAttempt(attemptId, { fallbackOnly: true });
        } catch (error) {
          console.error('[inngest grade-attempts-batch]', { attemptId, error });
          return null;
        }
      });
      if (!outcome) {
        errors += 1;
        continue;
      }
      regraded += outcome.regradedQuestionCount;
      stillPending += outcome.pendingQuestionCount;
    }
    return { scheduled: attemptIds.length, regraded, stillPending, errors };
  },
);

export const processMaterialFn = inngest.createFunction(
  {
    id: 'process-material',
    retries: 3,
    concurrency: [
      { limit: 5 },
      { key: 'event.data.tenantId', limit: 3 },
    ],
  },
  { event: 'knowledge/material.process' },
  async ({ event, step }) => {
    const materialId = event.data.materialId;
    const tenantId = event.data.tenantId ?? event.data.workspaceId;
    await step.run('process', async () => {
      if (tenantId) {
        return withTenant(tenantId, null, async () => processMaterial(materialId));
      }
      return processMaterial(materialId);
    });
    return { materialId, ok: true };
  },
);

export const ltiPassbackDrainFn = inngest.createFunction(
  {
    id: 'lti-passback-drain',
    retries: 2,
    concurrency: [{ limit: 4 }],
  },
  { event: 'lti/passback.drain' },
  async ({ event, step }) => {
    const limit = event.data.limit ?? 40;
    return step.run('drain', async () => processPendingPassbackJobs(limit));
  },
);

export const processBookFn = inngest.createFunction(
  {
    id: 'process-book',
    retries: 2,
    concurrency: [
      { limit: 4 },
      { key: 'event.data.tenantId', limit: 2 },
    ],
    timeouts: { finish: '15m' },
  },
  { event: 'books/book.process' },
  async ({ event, step }) => {
    await ensureWorkerRuntimeRole();
    const bookId = event.data.bookId;
    const tenantId = event.data.tenantId ?? event.data.workspaceId;
    await step.run('process', async () => {
      if (tenantId) {
        return withTenant(tenantId, null, async () => processBook(bookId));
      }
      return processBook(bookId);
    });
    return { bookId, ok: true };
  },
);

export const processKnowledgeDocumentFn = inngest.createFunction(
  {
    id: 'process-knowledge-document',
    retries: 2,
    concurrency: [
      { limit: 5 },
      { key: 'event.data.tenantId', limit: 3 },
    ],
  },
  { event: 'knowledge/document.process' },
  async ({ event, step }) => {
    const { processKnowledgeDocument } = await import(
      '@/lib/knowledge/processDocument'
    );
    const documentId = event.data.documentId;
    const tenantId = event.data.tenantId ?? event.data.workspaceId;
    await step.run('process', async () => {
      if (tenantId) {
        return withTenant(tenantId, null, async () =>
          processKnowledgeDocument(documentId),
        );
      }
      return processKnowledgeDocument(documentId);
    });
    return { documentId, ok: true };
  },
);

export const syncKnowledgeConnectorFn = inngest.createFunction(
  {
    id: 'sync-knowledge-connector',
    retries: 1,
    concurrency: [
      { limit: 4 },
      { key: 'event.data.tenantId', limit: 1 },
    ],
  },
  { event: 'knowledge/connector.sync' },
  async ({ event, step }) => {
    const { syncConnector } = await import('@/lib/knowledge/connectors/sync');
    const connectorId = event.data.connectorId;
    await step.run('sync', async () => syncConnector(connectorId));
    return { connectorId, ok: true };
  },
);

export const analyticsRollupsFn = inngest.createFunction(
  {
    id: 'analytics-rollups',
    retries: 1,
    concurrency: [{ limit: 2 }],
  },
  { cron: '0 6 * * *' },
  async ({ step }) => {
    const { computeAllAnalyticsRollups } = await import(
      '@/lib/analytics/computeRollups'
    );
    return step.run('compute-rollups', async () =>
      computeAllAnalyticsRollups({ limit: 300 }),
    );
  },
);

export const chatbotRetentionFn = inngest.createFunction(
  {
    id: 'chatbot-session-retention',
    retries: 1,
    concurrency: [{ limit: 1 }],
  },
  { cron: '0 3 * * 0' },
  async ({ step }) => {
    const { runChatbotSessionRetention } = await import('@/lib/jobs/retention');
    return step.run('retention', async () => runChatbotSessionRetention());
  },
);

export const solInngestFunctions = [
  gradeAttemptFn,
  gradeAttemptsBatchFn,
  processMaterialFn,
  ltiPassbackDrainFn,
  processBookFn,
  processKnowledgeDocumentFn,
  syncKnowledgeConnectorFn,
  analyticsRollupsFn,
  chatbotRetentionFn,
];
