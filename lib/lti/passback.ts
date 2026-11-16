import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  attempts,
  ltiLineItems,
  ltiPassbackJobs,
  ltiSectionLinks,
  ltiUserLinks,
} from '@/app/db/schema';
import { logAudit } from '@/lib/audit';
import { enqueueLtiPassbackDrain } from '@/lib/jobs/enqueue';
import { getLtiConfig } from '@/lib/lti/config';
import { postScore } from '@/lib/lti/ags';
import {
  ensureLineItemsForActivity,
  findLineItemForEntitySection,
  findLineItemForQuizSection,
  type ActivityEntityRef,
} from '@/lib/lti/lineItems';
import { getPlatformForSectionLink } from '@/lib/lti/links';
import {
  ensurePlatformFromEnv,
  resolveLtiWorkspaceId,
} from '@/lib/lti/platform';
import { isPendingStatus, type StoredFeedback } from '@/lib/gradingTypes';

const MAX_JOB_ATTEMPTS = 8;

function attemptIsPassbackReady(attempt: {
  gradingStatus: string | null;
  gptFeedback: unknown;
  submittedAt: Date | null;
}): boolean {
  if (!attempt.submittedAt) return false;
  if (attempt.gradingStatus !== 'complete') return false;
  const feedback = attempt.gptFeedback;
  if (!feedback || typeof feedback !== 'object') return true;
  for (const value of Object.values(feedback as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const status = (value as StoredFeedback).status;
    if (isPendingStatus(status)) return false;
  }
  return true;
}

async function bestCompleteAttempt(opts: {
  studentId: string;
  quizId: string;
  sectionId: string;
}) {
  const rows = await db.query.attempts.findMany({
    where: and(
      eq(attempts.studentId, opts.studentId),
      eq(attempts.quizId, opts.quizId),
      eq(attempts.sectionId, opts.sectionId),
      isNotNull(attempts.submittedAt),
    ),
  });

  const ready = rows.filter(attemptIsPassbackReady);
  if (ready.length === 0) return null;

  let best = ready[0]!;
  for (const row of ready) {
    if ((row.score ?? 0) > (best.score ?? 0)) best = row;
  }
  return best;
}

async function resolveLtiUserId(
  platformId: string,
  userId: string,
): Promise<string | null> {
  const link = await db.query.ltiUserLinks.findFirst({
    where: and(
      eq(ltiUserLinks.platformId, platformId),
      eq(ltiUserLinks.userId, userId),
    ),
  });
  return link?.ltiUserId ?? null;
}

/** tenant_id is NOT NULL in the DB (0039); the TS schema still types it nullable. */
function requireTenant(row: { id: string; tenantId: string | null }): string {
  if (!row.tenantId) throw new Error(`LTI line item ${row.id} has no tenant`);
  return row.tenantId;
}

async function enqueueJob(input: {
  idempotencyKey: string;
  lineItemRowId: string;
  /** The line item's tenant; jobs are stamped with it (FORCE RLS). */
  tenantId: string;
  userId: string;
  attemptId?: string | null;
  scoreGiven: number | null;
  scoreMaximum: number;
  activityProgress?: string;
  gradingProgress?: string;
  comment?: string | null;
}): Promise<void> {
  const existing = await db.query.ltiPassbackJobs.findFirst({
    where: eq(ltiPassbackJobs.idempotencyKey, input.idempotencyKey),
  });

  if (existing?.status === 'sent') {
    // Allow re-post when score changes (best attempt improved).
    if (
      existing.scoreGiven === input.scoreGiven &&
      existing.scoreMaximum === input.scoreMaximum
    ) {
      return;
    }
  }

  if (existing) {
    await db
      .update(ltiPassbackJobs)
      .set({
        lineItemId: input.lineItemRowId,
        attemptId: input.attemptId ?? null,
        scoreGiven: input.scoreGiven,
        scoreMaximum: input.scoreMaximum,
        activityProgress: input.activityProgress ?? 'Completed',
        gradingProgress: input.gradingProgress ?? 'FullyGraded',
        comment: input.comment ?? null,
        status: 'pending',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(ltiPassbackJobs.id, existing.id));
    return;
  }

  await db.insert(ltiPassbackJobs).values({
    idempotencyKey: input.idempotencyKey,
    tenantId: input.tenantId,
    lineItemId: input.lineItemRowId,
    userId: input.userId,
    attemptId: input.attemptId ?? null,
    scoreGiven: input.scoreGiven,
    scoreMaximum: input.scoreMaximum,
    activityProgress: input.activityProgress ?? 'Completed',
    gradingProgress: input.gradingProgress ?? 'FullyGraded',
    comment: input.comment ?? null,
    status: 'pending',
  });
}

/**
 * After quiz grading completes: enqueue Canvas score for best Attention-clear attempt.
 */
export async function enqueueQuizPassback(opts: {
  attemptId: string;
}): Promise<void> {
  const cfg = getLtiConfig();
  if (!cfg.enabled) return;

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, opts.attemptId),
  });
  if (!attempt?.sectionId || !attempt.quizId) return;
  if (!attemptIsPassbackReady(attempt)) return;

  const best = await bestCompleteAttempt({
    studentId: attempt.studentId,
    quizId: attempt.quizId,
    sectionId: attempt.sectionId,
  });
  if (!best) return;

  await ensureLineItemsForActivity({ quizId: attempt.quizId });
  const lineItem = await findLineItemForQuizSection(
    attempt.quizId,
    attempt.sectionId,
  );
  if (!lineItem?.lineItemUrl) return;

  const maxScore = best.maxScore && best.maxScore > 0 ? best.maxScore : 100;
  const scoreGiven = best.score ?? 0;

  await enqueueJob({
    idempotencyKey: `quiz:${attempt.quizId}:${attempt.studentId}:${attempt.sectionId}`,
    lineItemRowId: lineItem.id,
    tenantId: requireTenant(lineItem),
    userId: attempt.studentId,
    attemptId: best.id,
    scoreGiven,
    scoreMaximum: maxScore,
    comment: 'SOL quiz grade',
  });

  void enqueueLtiPassbackDrain(5);
}

/** Completion passback for lessons / discussions / interactives (0 or 100). */
export async function enqueueCompletionPassback(opts: {
  ref: ActivityEntityRef;
  studentId: string;
  sectionId: string;
  completed: boolean;
}): Promise<void> {
  const cfg = getLtiConfig();
  if (!cfg.enabled) return;
  if (!opts.completed) return;

  await ensureLineItemsForActivity(opts.ref);
  const lineItem = await findLineItemForEntitySection(
    opts.ref,
    opts.sectionId,
  );
  if (!lineItem?.lineItemUrl) return;

  const keyPart =
    'quizId' in opts.ref
      ? `quiz:${opts.ref.quizId}`
      : 'lessonId' in opts.ref
        ? `lesson:${opts.ref.lessonId}`
        : 'chatbotId' in opts.ref
          ? `discussion:${opts.ref.chatbotId}`
          : `interactive:${opts.ref.interactiveId}`;

  await enqueueJob({
    idempotencyKey: `completion:${keyPart}:${opts.studentId}:${opts.sectionId}`,
    lineItemRowId: lineItem.id,
    tenantId: requireTenant(lineItem),
    userId: opts.studentId,
    scoreGiven: 100,
    scoreMaximum: 100,
    comment: 'SOL activity completed',
  });

  void enqueueLtiPassbackDrain(5);
}

export type PassbackProcessResult = {
  processed: number;
  sent: number;
  failed: number;
};

export async function processPendingPassbackJobs(
  limit = 25,
): Promise<PassbackProcessResult> {
  const cfg = getLtiConfig();
  if (!cfg.enabled) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const ltiWorkspaceId = await resolveLtiWorkspaceId();
  await ensurePlatformFromEnv(ltiWorkspaceId);

  const jobs = await db.query.ltiPassbackJobs.findMany({
    where: inArray(ltiPassbackJobs.status, ['pending', 'failed']),
    limit,
    orderBy: (t, { asc }) => [asc(t.updatedAt)],
  });

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    if (job.attemptCount >= MAX_JOB_ATTEMPTS) {
      continue;
    }

    const lineItem = await db.query.ltiLineItems.findFirst({
      where: eq(ltiLineItems.id, job.lineItemId),
    });
    if (!lineItem?.lineItemUrl) {
      await db
        .update(ltiPassbackJobs)
        .set({
          status: 'failed',
          lastError: 'Missing AGS line item URL',
          attemptCount: job.attemptCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(ltiPassbackJobs.id, job.id));
      failed += 1;
      continue;
    }

    const sectionLink = await db.query.ltiSectionLinks.findFirst({
      where: eq(ltiSectionLinks.id, lineItem.sectionLinkId),
    });
    if (!sectionLink) {
      failed += 1;
      continue;
    }

    const platformMeta = await getPlatformForSectionLink(sectionLink);
    if (!platformMeta) {
      failed += 1;
      continue;
    }

    const ltiUserId = await resolveLtiUserId(
      platformMeta.platform.id,
      job.userId,
    );
    if (!ltiUserId) {
      await db
        .update(ltiPassbackJobs)
        .set({
          status: 'failed',
          lastError:
            'Student has no LTI user link. They must launch SOL from Canvas once.',
          attemptCount: job.attemptCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(ltiPassbackJobs.id, job.id));
      failed += 1;
      continue;
    }

    try {
      await postScore(cfg, lineItem.lineItemUrl, {
        userId: ltiUserId,
        scoreGiven: job.scoreGiven,
        scoreMaximum: job.scoreMaximum,
        activityProgress: job.activityProgress,
        gradingProgress: job.gradingProgress,
        comment: job.comment,
      });

      await db
        .update(ltiPassbackJobs)
        .set({
          status: 'sent',
          sentAt: new Date(),
          lastError: null,
          attemptCount: job.attemptCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(ltiPassbackJobs.id, job.id));

      await logAudit({
        actorUserId: job.userId,
        action: 'lti.passback.sent',
        targetType: 'lti_passback_job',
        targetId: job.id,
        metadata: {
          scoreGiven: job.scoreGiven,
          scoreMaximum: job.scoreMaximum,
          lineItemId: lineItem.id,
          attemptId: job.attemptId,
        },
      });
      sent += 1;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "We couldn't reach Canvas. Your grades are saved, and we'll retry in a few minutes.";
      await db
        .update(ltiPassbackJobs)
        .set({
          status: 'failed',
          lastError: message.slice(0, 1000),
          attemptCount: job.attemptCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(ltiPassbackJobs.id, job.id));
      await logAudit({
        actorUserId: job.userId,
        action: 'lti.passback.failed',
        targetType: 'lti_passback_job',
        targetId: job.id,
        metadata: { error: message.slice(0, 400) },
      });
      failed += 1;
    }
  }

  return { processed: jobs.length, sent, failed };
}
