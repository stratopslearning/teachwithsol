import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ enqueueBatch: vi.fn(async () => undefined) }));
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueGradeAttemptsBatch: m.enqueueBatch }));

import { enqueueBulkRegrades } from '@/lib/grading/batch';

describe('enqueueBulkRegrades', () => {
  it('queues every attempt, however many there are (#141)', async () => {
    // 40+ attempts used to go to an OpenAI batch that was never polled.
    const attemptIds = Array.from({ length: 120 }, (_, i) => `att-${i}`);
    const out = await enqueueBulkRegrades({ tenantId: 't1', attemptIds, professorId: 'p1' });
    expect(out).toEqual({ mode: 'fast_queue' });
    expect(m.enqueueBatch).toHaveBeenCalledExactlyOnceWith({
      attemptIds,
      workspaceId: 't1',
      professorId: 'p1',
    });
  });

  it('rejects an empty request', async () => {
    await expect(enqueueBulkRegrades({ tenantId: 't1', attemptIds: [''] })).rejects.toThrow(
      'No attempts to regrade',
    );
  });
});
