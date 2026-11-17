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
  return NextResponse.json({ ok: true, ...(await sweepAndDrain({ budgetMs: 270_000 })) });
});
