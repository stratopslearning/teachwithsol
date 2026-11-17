import type { JobKind } from '@/lib/jobs/kinds';

/** "Run queued jobs of these kinds" (lib/jobs/queue.ts kickDrain). */
export type JobsDrainRequested = {
  name: 'jobs/drain.requested';
  data: { kinds?: JobKind[] };
};

export type SolInngestEvents = JobsDrainRequested;
