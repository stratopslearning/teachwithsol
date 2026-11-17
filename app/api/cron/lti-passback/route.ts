import { NextRequest, NextResponse } from 'next/server';

import { isCronAuthorized } from '@/lib/api/cronAuth';
import { getLtiConfig } from '@/lib/lti/config';
import { processPendingPassbackJobs } from '@/lib/lti/passback';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cfg = getLtiConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ skipped: true, reason: 'lti_disabled' });
  }

  // Daily safety net; normal sends go through the job queue as scores land.
  const result = await processPendingPassbackJobs(40);
  return NextResponse.json(result);
}
