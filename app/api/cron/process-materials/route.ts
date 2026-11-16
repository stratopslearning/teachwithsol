import { NextRequest, NextResponse } from 'next/server';

import { isCronAuthorized } from '@/lib/api/cronAuth';
import { processPendingMaterials } from '@/lib/knowledge';
import { processPendingKnowledgeDocuments } from '@/lib/knowledge/processDocument';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Vercel cron / manual: process stuck PENDING course materials. */
export async function GET(req: NextRequest) {
  const ok =
    isCronAuthorized(req) ||
    (process.env.NODE_ENV !== 'production' && !process.env.CRON_SECRET);
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const processed = await processPendingMaterials(10);
  // Knowledge documents had no sweep of their own; stuck ones never retried.
  // Isolated so a failure here (e.g. migration 0114 not applied yet) never
  // blocks material processing above.
  let documents = 0;
  try {
    documents = await processPendingKnowledgeDocuments(10);
  } catch (err) {
    console.error('[cron/process-materials] knowledge document sweep failed', err);
  }
  return NextResponse.json({ ok: true, processed, documents });
}
