import { describe, expect, it } from 'vitest';

import { assessQueue, QUEUE_STALL_SECONDS } from '@/lib/jobs/health';

const base = { ready: 0, running: 0, oldestReadySeconds: 0, deadLast24h: 0 };

describe('assessQueue', () => {
  it('is healthy when nothing is waiting', () => {
    expect(assessQueue(base).stalled).toBe(false);
  });
  it('is healthy while ready jobs are fresh', () => {
    expect(assessQueue({ ...base, ready: 4, oldestReadySeconds: 120 }).stalled).toBe(false);
  });
  it('is stalled when a ready job has waited past the threshold', () => {
    expect(assessQueue({ ...base, ready: 1, oldestReadySeconds: QUEUE_STALL_SECONDS + 1 }).stalled).toBe(true);
  });
  it("doesn't fail on dead jobs alone", () => {
    expect(assessQueue({ ...base, deadLast24h: 3 }).stalled).toBe(false);
  });
});
