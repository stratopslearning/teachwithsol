/**
 * Feature-facing enqueue helpers. Each one writes a durable job row
 * (lib/jobs/queue.ts) and kicks a drain; the runner owns retries, backoff
 * and dead-lettering.
 */
import { enqueue, kickDrain } from '@/lib/jobs/queue';
import { checkAiBandAvailable, getCourseWorkspaceId } from '@/lib/workspace';

function tenantOrNull(workspaceId: string | null | undefined): string | null {
  return workspaceId && workspaceId !== 'default' ? workspaceId : null;
}

/** Resolve the attempt's tenant when the caller didn't pass one. */
async function resolveAttemptWorkspaceId(
  attemptId: string,
  workspaceId: string,
): Promise<string | null> {
  if (workspaceId && workspaceId !== 'default') return workspaceId;
  // FORCE RLS: plain db reads find nothing here; use the definer lookups.
  const { loadAttemptForGrading } = await import('@/lib/quiz/gradingData');
  const attempt = await loadAttemptForGrading(attemptId);
  if (attempt?.tenantId) return attempt.tenantId;
  if (!attempt?.sectionId) return null;
  const { fetchSectionById } = await import('@/lib/db/entityScopedReads');
  const section = await fetchSectionById(attempt.sectionId);
  if (section?.tenantId ?? section?.workspaceId) {
    return section!.tenantId ?? section!.workspaceId;
  }
  if (section?.courseId) return getCourseWorkspaceId(section.courseId);
  return null;
}

export async function enqueueGradeAttempt(
  attemptId: string,
  workspaceId: string = 'default',
): Promise<void> {
  if (!attemptId) return;

  const tenantId = await resolveAttemptWorkspaceId(attemptId, workspaceId);
  const aiCap = await checkAiBandAvailable(tenantId);
  if (!aiCap.ok) {
    console.warn('[jobs] grade enqueue skipped: AI cap', {
      attemptId,
      workspaceId: tenantId,
      used: aiCap.used,
      cap: aiCap.cap,
    });
    return;
  }
  await enqueue('grade_attempt', {
    tenantId: tenantOrNull(tenantId ?? workspaceId),
    payload: { attemptId },
    dedupeKey: attemptId,
  });
}

/** Bulk Attention regrade: one job per attempt. */
export async function enqueueGradeAttemptsBatch(opts: {
  attemptIds: string[];
  workspaceId?: string;
  professorId?: string;
}): Promise<void> {
  const attemptIds = [...new Set(opts.attemptIds.filter(Boolean))];
  if (attemptIds.length === 0) return;
  const tenantId = tenantOrNull(opts.workspaceId);
  for (const attemptId of attemptIds) {
    await enqueue('regrade_attempt', {
      tenantId,
      payload: { attemptId, professorId: opts.professorId },
      dedupeKey: attemptId,
      noKick: true,
    });
  }
  // Up to three drains work through the batch side by side, as before.
  await kickDrain(['regrade_attempt'], Math.min(attemptIds.length, 3));
}

export async function enqueueMaterialProcess(
  materialId: string,
  workspaceId: string = 'default',
  opts: { reset?: boolean } = {},
): Promise<void> {
  if (!materialId) return;
  const tenantId = tenantOrNull(workspaceId);
  const aiCap = await checkAiBandAvailable(tenantId);
  if (!aiCap.ok) {
    console.warn('[jobs] material enqueue skipped: AI cap', { materialId, workspaceId });
    return;
  }
  await enqueue('process_material', {
    tenantId,
    payload: { materialId, ...(opts.reset ? { reset: true } : {}) },
    dedupeKey: materialId,
  });
}

export async function enqueueKnowledgeDocumentProcess(
  documentId: string,
  workspaceId: string = 'default',
  opts: { reset?: boolean } = {},
): Promise<void> {
  if (!documentId) return;
  const tenantId = tenantOrNull(workspaceId);
  const aiCap = await checkAiBandAvailable(tenantId);
  if (!aiCap.ok) {
    console.warn('[jobs] document enqueue skipped: AI cap', { documentId, workspaceId });
    return;
  }
  await enqueue('process_document', {
    tenantId,
    payload: { documentId, ...(opts.reset ? { reset: true } : {}) },
    dedupeKey: documentId,
  });
}

export async function enqueueConnectorSync(
  connectorId: string,
  workspaceId: string = 'default',
): Promise<void> {
  if (!connectorId) return;
  await enqueue('sync_connector', {
    tenantId: tenantOrNull(workspaceId),
    payload: { connectorId },
    dedupeKey: connectorId,
  });
}

export async function enqueueBookProcess(
  bookId: string,
  workspaceId: string = 'default',
  opts: { reset?: boolean } = {},
): Promise<void> {
  if (!bookId) return;
  await enqueue('process_book', {
    tenantId: tenantOrNull(workspaceId),
    payload: { bookId, ...(opts.reset ? { reset: true } : {}) },
    dedupeKey: bookId,
  });
}

/** Passback jobs have their own table and backoff; this just schedules a send. */
export async function enqueueLtiPassbackDrain(limit = 40): Promise<void> {
  await enqueue('lti_passback_drain', {
    tenantId: null,
    payload: { limit },
    dedupeKey: 'drain',
  });
}
