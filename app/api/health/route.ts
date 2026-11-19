import { NextResponse } from 'next/server';

import { assertRuntimeRole } from '@/lib/db/assertRuntimeRole';
import { queueHealth } from '@/lib/jobs/health';

export const dynamic = 'force-dynamic';

/**
 * Liveness for uptime monitors. 503 when:
 * - the process is connected with an unsafe database role (bypass RLS, table
 *   owner, or MEMBER of owner), or
 * - background jobs have stopped draining (a ready job waited > 30 min).
 */
export async function GET() {
  try {
    const role = await assertRuntimeRole();
    if (!role.ok) {
      return NextResponse.json(
        { ok: false, error: role.reason, currentUser: role.currentUser },
        { status: 503 },
      );
    }
    const queue = await queueHealth().catch(() => null);
    if (queue?.stalled) {
      console.error('[health] job queue stalled', queue);
      return NextResponse.json({ ok: false, error: 'job_queue_stalled', queue }, { status: 503 });
    }
    return NextResponse.json({ ok: true, currentUser: role.currentUser, queue });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'health check failed';
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
