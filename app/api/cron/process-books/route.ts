import { NextRequest, NextResponse } from 'next/server';

import { isCronAuthorized } from '@/lib/api/cronAuth';
import { processPendingBooks } from '@/lib/books';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Vercel cron / manual: process stuck PENDING hosted books. */
export async function GET(req: NextRequest) {
  const ok =
    isCronAuthorized(req) ||
    (process.env.NODE_ENV !== 'production' && !process.env.CRON_SECRET);
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const processed = await processPendingBooks(3);
  return NextResponse.json({ ok: true, processed });
}
