import { after } from 'next/server';

import { processBook } from '@/lib/books/process';
import { gradePendingForAttemptId } from '@/lib/pendingGrader';
import { processMaterial } from '@/lib/knowledge/process';
import { processKnowledgeDocument } from '@/lib/knowledge/processDocument';
import { syncConnector } from '@/lib/knowledge/connectors/sync';
import { processPendingPassbackJobs } from '@/lib/lti/passback';
import { regradeAttempt } from '@/lib/regradeAttempt';

import { db } from '@/app/db';
import { attempts, sections } from '@/app/db/schema';
import { eq } from 'drizzle-orm';

import { jobsBackend } from '@/lib/jobs/backend';
import { inngest } from '@/lib/jobs/client';
import { checkAiBandAvailable, getCourseWorkspaceId } from '@/lib/workspace';

const gradeInFlight = new Set<string>();
const materialInFlight = new Set<string>();
const bookInFlight = new Set<string>();
const documentInFlight = new Set<string>();
const connectorInFlight = new Set<string>();

function inngestTenantPayload(workspaceId: string): {
  workspaceId: string;
  tenantId?: string;
} {
  if (workspaceId && workspaceId !== 'default') {
    return { workspaceId, tenantId: workspaceId };
  }
  return { workspaceId };
}

function runAfter(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/**
 * Enqueue short-answer grading for an attempt.
 * Prefer Inngest when JOBS_BACKEND=inngest; fall back to `after()` on send failure.
 */
async function resolveAttemptWorkspaceId(
  attemptId: string,
  workspaceId: string,
): Promise<string | null> {
  if (workspaceId && workspaceId !== 'default') return workspaceId;
  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    columns: { sectionId: true },
  });
  if (!attempt?.sectionId) return null;
  const section = await db.query.sections.findFirst({
    where: eq(sections.id, attempt.sectionId),
    columns: { courseId: true, workspaceId: true },
  });
  if (section?.workspaceId) return section.workspaceId;
  if (section?.courseId) return getCourseWorkspaceId(section.courseId);
  return null;
}

export async function enqueueGradeAttempt(
  attemptId: string,
  workspaceId: string = 'default',
): Promise<void> {
  if (!attemptId) return;

  const resolvedWorkspaceId = await resolveAttemptWorkspaceId(
    attemptId,
    workspaceId,
  );
  const aiCap = await checkAiBandAvailable(resolvedWorkspaceId);
  if (!aiCap.ok) {
    console.warn('[jobs] grade enqueue skipped: AI cap', {
      attemptId,
      workspaceId: resolvedWorkspaceId,
      used: aiCap.used,
      cap: aiCap.cap,
    });
    return;
  }

  const enqueueWorkspaceId = resolvedWorkspaceId ?? workspaceId;

  if (jobsBackend() === 'inngest') {
    try {
      await inngest.send({
        name: 'grading/attempt.requested',
        data: { attemptId, ...inngestTenantPayload(enqueueWorkspaceId) },
      });
      return;
    } catch (error) {
      console.warn('[jobs] inngest grade send failed; using after()', {
        attemptId,
        error,
      });
    }
  }

  if (gradeInFlight.has(attemptId)) return;
  gradeInFlight.add(attemptId);
  runAfter(async () => {
    try {
      const result = await gradePendingForAttemptId(attemptId);
      if (result.regraded > 0 || result.promoted > 0) {
        console.info('[jobs/after] graded attempt', {
          attemptId,
          regraded: result.regraded,
          stillPending: result.stillPending,
          promoted: result.promoted,
        });
      }
    } catch (error) {
      console.error('[jobs/after] grade error', { attemptId, error });
    } finally {
      gradeInFlight.delete(attemptId);
    }
  });
}

/** Bulk Attention regrade — Inngest batch event or concurrent after(). */
export async function enqueueGradeAttemptsBatch(opts: {
  attemptIds: string[];
  workspaceId?: string;
  professorId?: string;
}): Promise<void> {
  const attemptIds = opts.attemptIds.filter(Boolean);
  if (attemptIds.length === 0) return;
  const workspaceId = opts.workspaceId ?? 'default';

  if (jobsBackend() === 'inngest') {
    try {
      await inngest.send({
        name: 'grading/attempts.batch.requested',
        data: {
          attemptIds,
          ...inngestTenantPayload(workspaceId),
          professorId: opts.professorId,
        },
      });
      return;
    } catch (error) {
      console.warn('[jobs] inngest batch send failed; using after()', error);
    }
  }

  runAfter(async () => {
    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async () => {
      while (cursor < attemptIds.length) {
        const id = attemptIds[cursor++]!;
        try {
          await regradeAttempt(id, { fallbackOnly: true });
        } catch (error) {
          console.error('[jobs/after] regrade error', { id, error });
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  });
}

export async function enqueueMaterialProcess(
  materialId: string,
  workspaceId: string = 'default',
): Promise<void> {
  if (!materialId) return;

  const aiCap = await checkAiBandAvailable(
    workspaceId === 'default' ? null : workspaceId,
  );
  if (!aiCap.ok) {
    console.warn('[jobs] material enqueue skipped: AI cap', {
      materialId,
      workspaceId,
    });
    return;
  }

  if (jobsBackend() === 'inngest') {
    try {
      await inngest.send({
        name: 'knowledge/material.process',
        data: { materialId, ...inngestTenantPayload(workspaceId) },
      });
      return;
    } catch (error) {
      console.warn('[jobs] inngest material send failed; using after()', {
        materialId,
        error,
      });
    }
  }

  if (materialInFlight.has(materialId)) return;
  materialInFlight.add(materialId);
  runAfter(async () => {
    try {
      await processMaterial(materialId);
    } catch (error) {
      console.error('[jobs/after] material error', { materialId, error });
    } finally {
      materialInFlight.delete(materialId);
    }
  });
}

export async function enqueueKnowledgeDocumentProcess(
  documentId: string,
  workspaceId: string = 'default',
): Promise<void> {
  if (!documentId) return;

  const aiCap = await checkAiBandAvailable(
    workspaceId === 'default' ? null : workspaceId,
  );
  if (!aiCap.ok) {
    console.warn('[jobs] document enqueue skipped: AI cap', {
      documentId,
      workspaceId,
    });
    return;
  }

  if (jobsBackend() === 'inngest') {
    try {
      await inngest.send({
        name: 'knowledge/document.process',
        data: { documentId, ...inngestTenantPayload(workspaceId) },
      });
      return;
    } catch (error) {
      console.warn('[jobs] inngest document send failed; using after()', {
        documentId,
        error,
      });
    }
  }

  if (documentInFlight.has(documentId)) return;
  documentInFlight.add(documentId);
  runAfter(async () => {
    try {
      await processKnowledgeDocument(documentId);
    } catch (error) {
      console.error('[jobs/after] document error', { documentId, error });
    } finally {
      documentInFlight.delete(documentId);
    }
  });
}

export async function enqueueConnectorSync(
  connectorId: string,
  workspaceId: string = 'default',
): Promise<void> {
  if (!connectorId) return;

  if (jobsBackend() === 'inngest') {
    try {
      await inngest.send({
        name: 'knowledge/connector.sync',
        data: { connectorId, ...inngestTenantPayload(workspaceId) },
      });
      return;
    } catch (error) {
      console.warn('[jobs] inngest connector sync failed; using after()', {
        connectorId,
        error,
      });
    }
  }

  if (connectorInFlight.has(connectorId)) return;
  connectorInFlight.add(connectorId);
  runAfter(async () => {
    try {
      await syncConnector(connectorId);
    } catch (error) {
      console.error('[jobs/after] connector sync error', { connectorId, error });
    } finally {
      connectorInFlight.delete(connectorId);
    }
  });
}

export async function enqueueBookProcess(
  bookId: string,
  workspaceId: string = 'default',
): Promise<void> {
  if (!bookId) return;

  let inngestOk = false;
  if (jobsBackend() === 'inngest') {
    try {
      await inngest.send({
        name: 'books/book.process',
        data: { bookId, ...inngestTenantPayload(workspaceId) },
      });
      inngestOk = true;
    } catch (error) {
      console.warn('[jobs] inngest book send failed; using after()', {
        bookId,
        error,
      });
    }
  }

  // Always schedule after() as a best-effort path. processBook claims via
  // onlyIfStatus=PENDING so Inngest and after() cannot double-process.
  // Large EPUBs that exceed after() lifetime are drained by /api/cron/process-books.
  if (bookInFlight.has(bookId)) return;
  bookInFlight.add(bookId);
  runAfter(async () => {
    try {
      await processBook(bookId);
    } catch (error) {
      console.error('[jobs/after] book error', {
        bookId,
        inngestOk,
        error,
      });
    } finally {
      bookInFlight.delete(bookId);
    }
  });
}

export async function enqueueLtiPassbackDrain(
  limit = 40,
  workspaceId?: string,
): Promise<void> {
  if (jobsBackend() === 'inngest') {
    try {
      await inngest.send({
        name: 'lti/passback.drain',
        data: { limit, workspaceId },
      });
      return;
    } catch (error) {
      console.warn('[jobs] inngest lti drain send failed; running inline', error);
    }
  }
  void processPendingPassbackJobs(limit).catch((err) =>
    console.error('[jobs/after] lti passback failed', err),
  );
}
