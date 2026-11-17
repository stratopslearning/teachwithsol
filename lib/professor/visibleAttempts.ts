/**
 * Professor attempt visibility: section-scoped only.
 *
 * Professors only see attempts recorded under sections they teach
 * (`attempts.section_id`), not attempts from other sections just because
 * the same quiz is assigned there or the learner appears on another roster.
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { attempts } from "@/app/db/schema";
import { fetchSectionById } from "@/lib/db/entityScopedReads";
import { groupSectionIdsByTenant } from "@/lib/db/sectionTenants";
import { withTenant } from "@/lib/db/tenantContext";

type TenantTx = Parameters<Parameters<typeof withTenant>[2]>[0];

/** Columns needed for results lists — never pull answers / gpt_feedback JSONB. */
const attemptListColumns = {
  id: true,
  assignmentId: true,
  studentId: true,
  quizId: true,
  sectionId: true,
  score: true,
  maxScore: true,
  percentage: true,
  passed: true,
  gradingStatus: true,
  startedAt: true,
  submittedAt: true,
} as const;

/**
 * Submitted attempts for one quiz, limited to the professor's section ids.
 * By default omits answers/gptFeedback JSONB. Pass `includePayloads: true`
 * only for question-level analytics that need them.
 */
export async function fetchSubmittedAttemptsForProfessorSections(options: {
  quizId: string;
  professorSectionIds: string[];
  /** When set, only attempts stamped with this section (per-section results row). */
  restrictToSectionId?: string;
  /** Include answers + gptFeedback (large). Default false. */
  includePayloads?: boolean;
}) {
  const {
    quizId,
    professorSectionIds,
    restrictToSectionId,
    includePayloads = false,
  } = options;
  const scopeSectionIds = restrictToSectionId
    ? professorSectionIds.filter((id) => id === restrictToSectionId)
    : professorSectionIds;

  if (scopeSectionIds.length === 0) return [];

  // FORCE RLS: a plain db read returns no attempts. Read each tenant's
  // sections under that tenant, then merge newest-first.
  const byTenant = await groupSectionIdsByTenant(scopeSectionIds);
  const perTenant = await Promise.all(
    [...byTenant].map(([tenantId, sectionIds]) =>
      withTenant(tenantId, null, (tx) => readAttempts(tx, sectionIds)),
    ),
  );
  const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  return perTenant
    .flat()
    .sort((a, b) => time(b.submittedAt) - time(a.submittedAt));

  function readAttempts(tx: TenantTx, sectionIds: string[]) {
    return tx.query.attempts.findMany({
      columns: includePayloads
        ? {
            ...attemptListColumns,
            answers: true,
            gptFeedback: true,
          }
        : attemptListColumns,
      where: and(
        eq(attempts.quizId, quizId),
        isNotNull(attempts.submittedAt),
        inArray(attempts.sectionId, sectionIds),
      ),
      with: {
        student: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        section: {
          columns: { id: true, name: true },
          with: { course: { columns: { id: true, title: true } } },
        },
      },
      orderBy: (cols, { desc: d }) => [d(cols.submittedAt)],
    });
  }
}

/**
 * Gradebook for one section: best submitted attempt per (student, quiz) where
 * the attempt was taken in THIS section only.
 * Selects score columns only (no answers / feedback JSONB).
 */
export async function buildGradebookScoresForSection(options: {
  sectionId: string;
  quizIds: string[];
  enrolledStudentIds: string[];
}) {
  const { sectionId, quizIds, enrolledStudentIds } = options;
  if (quizIds.length === 0 || enrolledStudentIds.length === 0) return {};

  // FORCE RLS: read under the section's tenant (a plain db read returned no
  // attempts, so every gradebook cell was empty).
  const section = await fetchSectionById(sectionId);
  const tenantId = section?.tenantId ?? section?.workspaceId;
  if (!tenantId) return {};
  const rows = await withTenant(tenantId, null, (tx) =>
    tx
      .select({
        id: attempts.id,
        studentId: attempts.studentId,
        quizId: attempts.quizId,
        score: attempts.score,
        maxScore: attempts.maxScore,
        percentage: attempts.percentage,
      })
      .from(attempts)
      .where(
        and(
          inArray(attempts.quizId, quizIds),
          isNotNull(attempts.submittedAt),
          eq(attempts.sectionId, sectionId),
          inArray(attempts.studentId, enrolledStudentIds),
        ),
      )
      .orderBy(desc(attempts.submittedAt)),
  );

  const scores: Record<
    string,
    Record<
      string,
      {
        score: number;
        percentage: number;
        attemptId: string;
        maxScore: number;
      }
    >
  > = {};

  for (const attempt of rows) {
    const pct =
      attempt.percentage ??
      (attempt.maxScore
        ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100)
        : 0);
    const score = attempt.score ?? 0;
    if (!scores[attempt.studentId]) scores[attempt.studentId] = {};
    const existing = scores[attempt.studentId][attempt.quizId];
    if (
      !existing ||
      pct > existing.percentage ||
      (pct === existing.percentage && score > existing.score)
    ) {
      scores[attempt.studentId][attempt.quizId] = {
        score,
        percentage: pct,
        attemptId: attempt.id,
        maxScore: attempt.maxScore ?? 0,
      };
    }
  }

  return scores;
}
