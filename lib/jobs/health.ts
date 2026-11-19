/**
 * Is background work flowing? The jobs cron drains every 10 minutes, so a
 * ready job older than 30 minutes means drains have stopped (cron or Inngest
 * down). Dead jobs are reported but don't fail the check on their own.
 */
import { jobQueueStats, type JobQueueStats } from '@/lib/db/jobQueue';

export const QUEUE_STALL_SECONDS = 30 * 60;

export type QueueHealth = JobQueueStats & { stalled: boolean };

export function assessQueue(stats: JobQueueStats): QueueHealth {
  return { ...stats, stalled: stats.ready > 0 && stats.oldestReadySeconds > QUEUE_STALL_SECONDS };
}

export async function queueHealth(): Promise<QueueHealth> {
  return assessQueue(await jobQueueStats());
}
