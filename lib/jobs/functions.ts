import { inngest } from '@/lib/jobs/client';
import { JOB_KINDS, isJobKind } from '@/lib/jobs/kinds';

/**
 * Every queued job kind is run by this one function: the event only says
 * "there is work"; the rows in job_queue say what. Retries are the queue's
 * job, not Inngest's, so a failed drain isn't replayed (retries: 0).
 */
export const drainJobsFn = inngest.createFunction(
  {
    id: 'drain-jobs',
    retries: 0,
    // Inngest free/hobby plan caps concurrency at 5 — higher values fail app sync.
    concurrency: [{ limit: 5 }],
  },
  { event: 'jobs/drain.requested' },
  async ({ event, step }) => {
    const kinds = (event.data.kinds ?? []).filter(isJobKind);
    return step.run('drain', async () => {
      const { drain } = await import('@/lib/jobs/queue');
      return drain({ kinds: kinds.length ? kinds : JOB_KINDS, budgetMs: 270_000 });
    });
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
  drainJobsFn,
  analyticsRollupsFn,
  chatbotRetentionFn,
];
