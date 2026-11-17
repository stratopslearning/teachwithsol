/**
 * What each job kind does. Loaded lazily by the runner (lib/jobs/queue.ts),
 * which already runs the handler under withTenant(job.tenantId).
 *
 * Handlers throw to ask for a retry. Processors that record their own
 * terminal FAILED status (books, materials, documents) return normally after
 * doing so; the user sees that status and can retry from the UI.
 */
import type { JobKind } from '@/lib/jobs/kinds';

export type JobContext = {
  id: string;
  tenantId: string | null;
  payload: Record<string, unknown>;
  /** 1 on the first run. */
  attempt: number;
};

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (typeof v !== 'string' || !v) throw new Error(`job payload missing ${key}`);
  return v;
}

export const handlers: Record<JobKind, (ctx: JobContext) => Promise<void>> = {
  async grade_attempt({ payload }) {
    const { gradePendingForAttemptId } = await import('@/lib/grading/pendingGrader');
    await gradePendingForAttemptId(str(payload, 'attemptId'));
  },

  async regrade_attempt({ payload }) {
    const { regradeAttempt } = await import('@/lib/grading/regradeAttempt');
    await regradeAttempt(str(payload, 'attemptId'), { fallbackOnly: true });
  },

  async process_material({ payload }) {
    const materialId = str(payload, 'materialId');
    const { processMaterial } = await import('@/lib/knowledge/process');
    if (payload.reset) {
      // A sweep found this row stuck in PROCESSING: its worker died.
      const { setCourseMaterialStatusDefiner } = await import('@/lib/db/knowledgeJobDefiners');
      await setCourseMaterialStatusDefiner(materialId, 'PENDING', null);
    }
    await processMaterial(materialId);
  },

  async process_document({ payload }) {
    const documentId = str(payload, 'documentId');
    const { processKnowledgeDocument } = await import('@/lib/knowledge/processDocument');
    if (payload.reset) {
      const { resetKnowledgeDocumentPendingDefiner } = await import('@/lib/db/knowledgeJobDefiners');
      await resetKnowledgeDocumentPendingDefiner(documentId);
    }
    await processKnowledgeDocument(documentId);
  },

  async process_book({ payload }) {
    const bookId = str(payload, 'bookId');
    const { processBook } = await import('@/lib/books/process');
    if (payload.reset) {
      const { updateHostedBookDefiner } = await import('@/lib/db/bookWriteDefiners');
      await updateHostedBookDefiner({
        bookId,
        status: 'PENDING',
        errorMessage: null,
        onlyIfStatus: 'PROCESSING',
      });
    }
    await processBook(bookId);
  },

  async sync_connector({ payload }) {
    const { syncConnector } = await import('@/lib/knowledge/connectors/sync');
    await syncConnector(str(payload, 'connectorId'));
  },

  async lti_passback_drain({ payload }) {
    const { processPendingPassbackJobs } = await import('@/lib/lti/passback');
    const limit = typeof payload.limit === 'number' ? payload.limit : 40;
    await processPendingPassbackJobs(limit);
  },
};
