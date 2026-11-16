import { NextResponse } from 'next/server';

import { checkAiBandAvailable } from '@/lib/workspace/aiCapGuard';
import { getCourseWorkspaceId } from '@/lib/workspace/access';

/**
 * Enforce the workspace AI band before a tutor reply. Returns a response to
 * send instead of replying, or null when the call may proceed.
 *
 * Fails closed: if the cap can't be checked, the tutor doesn't run (same as
 * grading, authoring and knowledge processing, which let the error surface).
 */
export async function tutorAiCapBlock(
  courseId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!courseId) return null;
  try {
    const workspaceId = await getCourseWorkspaceId(courseId);
    const cap = await checkAiBandAvailable(workspaceId);
    if (cap.ok) return null;
    return NextResponse.json(
      {
        error: cap.reason,
        code: 'ai_band_exceeded',
        used: cap.used,
        cap: cap.cap,
      },
      { status: 429 },
    );
  } catch (err) {
    console.error('[chatbot] AI cap check failed; refusing tutor call', err);
    return NextResponse.json(
      {
        error: 'The tutor is temporarily unavailable. Please try again shortly.',
        code: 'ai_cap_unavailable',
      },
      { status: 503 },
    );
  }
}
