import { NextRequest, NextResponse } from 'next/server';

import { isCronAuthorized } from '@/lib/api/cronAuth';
import { sweepAndDrain } from '@/lib/jobs/sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Vercel cron / manual: queue stuck materials, documents and books, then drain. */
export async function GET(req: NextRequest) {
  const ok =
    isCronAuthorized(req) ||
    (process.env.NODE_ENV !== 'production' && !process.env.CRON_SECRET);
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await sweepAndDrain({ budgetMs: 270_000 })) });
}
