/**
 * Cron safety net: queue work for rows that never got a job (created before
 * the queue existed, or whose enqueue failed) and for rows whose worker died
 * mid-run, then drain the queue.
 */
import { drain, type DrainResult } from '@/lib/jobs/queue';

export async function sweepAndDrain(opts: { budgetMs?: number } = {}): Promise<{
  queued: { materials: number; documents: number; books: number };
  drained: DrainResult;
}> {
  const queued = { materials: 0, documents: 0, books: 0 };
  const sweeps: Array<[keyof typeof queued, () => Promise<number>]> = [
    ['materials', async () => (await import('@/lib/knowledge/process')).processPendingMaterials(10)],
    ['documents', async () => (await import('@/lib/knowledge/processDocument')).processPendingKnowledgeDocuments(10)],
    ['books', async () => (await import('@/lib/books/process')).processPendingBooks(3)],
  ];
  // Each sweep is isolated so one failing listing never blocks the others.
  for (const [key, sweep] of sweeps) {
    try {
      queued[key] = await sweep();
    } catch (error) {
      console.error(`[jobs/sweep] ${key} sweep failed`, error);
    }
  }
  const drained = await drain({ budgetMs: opts.budgetMs ?? 240_000, limit: 50 });
  return { queued, drained };
}
