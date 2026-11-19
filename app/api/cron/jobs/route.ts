import { NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { route } from '@/lib/api/route';
import { sweepAndDrain } from '@/lib/jobs/sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Vercel cron (every 10 min): sweep stuck rows into the job queue and drain it. */
export const GET = route({ auth: 'public' }, async ({ req }) => {
  if (!isCronAuthorized(req)) throw ApiError.unauthorized();
  const started = Date.now();
  const result = await sweepAndDrain({ budgetMs: 270_000 });
  // One line per run so a silent cron is visible in logs (and Sentry's drain).
  const summary = { ...result, ms: Date.now() - started };
  if (result.drained.dead > 0) console.error('[cron/jobs] jobs went dead', summary);
  else console.info('[cron/jobs] run', JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...result });
});
