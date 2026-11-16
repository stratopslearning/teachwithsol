import { and, eq } from 'drizzle-orm';

import {
  attempts,
  chatbotSessions,
  studentSections,
} from '@/app/db/schema';
import { maybeDecryptAttemptAnswers } from '@/lib/crypto/fieldEncryption';
import { fetchStudentTenantIdsDefiner } from '@/lib/db/studentWriteDefiners';
import { withTenant } from '@/lib/db/tenantContext';

const MAX_ATTEMPTS = 500;
const MAX_SESSIONS = 200;

/**
 * A student's own data across every tenant they belong to.
 *
 * These tables are FORCE RLS: a plain db read with no tenant set returns
 * nothing, so the export used to come back empty. The student's tenants come
 * from a SECURITY DEFINER lookup, and each tenant is read under withTenant.
 */
export async function exportStudentData(studentId: string) {
  const tenantIds = await fetchStudentTenantIdsDefiner(studentId);

  const perTenant = await Promise.all(
    tenantIds.map((tenantId) =>
      withTenant(tenantId, studentId, async (tx) => ({
        enrollments: await tx.query.studentSections.findMany({
          where: and(
            eq(studentSections.studentId, studentId),
            eq(studentSections.status, 'ACTIVE'),
          ),
          with: { section: true },
        }),
        attempts: await tx.query.attempts.findMany({
          where: eq(attempts.studentId, studentId),
          orderBy: (t, { desc }) => [desc(t.submittedAt)],
          limit: MAX_ATTEMPTS,
        }),
        sessions: await tx.query.chatbotSessions.findMany({
          where: eq(chatbotSessions.studentId, studentId),
          orderBy: (t, { desc }) => [desc(t.startedAt)],
          limit: MAX_SESSIONS,
        }),
      })),
    ),
  );

  const enrollments = perTenant.flatMap((t) => t.enrollments);
  // Same caps and ordering as before (Postgres DESC puts NULLs first, so
  // in-progress attempts lead), applied across all tenants.
  const time = (d: Date | null | undefined) => (d ? new Date(d).getTime() : Infinity);
  const attemptRows = perTenant
    .flatMap((t) => t.attempts)
    .sort((a, b) => time(b.submittedAt) - time(a.submittedAt))
    .slice(0, MAX_ATTEMPTS);
  const sessions = perTenant
    .flatMap((t) => t.sessions)
    .sort((a, b) => time(b.startedAt) - time(a.startedAt))
    .slice(0, MAX_SESSIONS);

  return {
    exportedAt: new Date().toISOString(),
    enrollments: enrollments.map((e) => ({
      sectionId: e.sectionId,
      sectionName: e.section?.name ?? null,
      courseId: e.section?.courseId ?? null,
      enrolledAt: e.enrolledAt,
    })),
    attempts: attemptRows.map((a) => ({
      id: a.id,
      quizId: a.quizId,
      sectionId: a.sectionId,
      score: a.score,
      maxScore: a.maxScore,
      percentage: a.percentage,
      passed: a.passed,
      gradingStatus: a.gradingStatus,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      answers: maybeDecryptAttemptAnswers(a.answers),
    })),
    chatbotSessions: sessions.map((s) => ({
      id: s.id,
      chatbotId: s.chatbotId,
      sectionId: s.sectionId,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      messageCount: (s.messages ?? []).length,
      sessionMetadata: s.sessionMetadata,
    })),
  };
}
