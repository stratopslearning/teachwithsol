/**
 * Professor grading reads (gradebook, attempts, attempt detail), shared by
 * the REST API and MCP tools. Every function here discloses education
 * records, so each logs to the audit trail.
 */
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { parse as toCsv } from 'json2csv';

import {
  attempts,
  quizSections,
  quizzes,
  sections,
  studentSections,
  users,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { listTeachingSectionIds } from '@/lib/professor/graderSections';
import { logAudit, logGradebookAccess } from '@/lib/audit';
import { activeOnly } from '@/lib/db/filters';
import type { UserData } from '@/lib/getOrCreateUser';
import { comparePersonsByLastName } from '@/lib/personName';
import { buildGradebookScoresForSection, fetchSubmittedAttemptsForProfessorSections } from '@/lib/professorVisibleAttempts';
import {
  accessibleQuizSectionIds,
  professorCanAccessQuiz,
} from '@/lib/quizAccess';
import { assertTeachesSection } from '@/lib/professor/sections';
import { loadAttemptForGrading } from '@/lib/quiz/gradingData';
import { withTenant } from '@/lib/db/tenantContext';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import { groupSectionIdsByTenant } from '@/lib/db/sectionTenants';

type ProfessorUser = Pick<UserData, 'id' | 'clerkId'> & { platformStaff?: boolean | null };

function personName(p: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || 'Unknown';
}

export type GradebookData = {
  section: { id: string; name: string; courseTitle: string | null };
  quizzes: { id: string; title: string }[];
  learners: {
    id: string;
    name: string;
    email: string | null;
    average: number | null;
    cells: Record<
      string,
      { score: number; maxScore: number; percentage: number; attemptId: string }
    >;
  }[];
};

export async function getSectionGradebook(
  user: ProfessorUser,
  sectionId: string,
): Promise<GradebookData> {
  await assertTeachesSection(user, sectionId);

  // FORCE RLS: plain db reads return nothing (the gradebook was always
  // "Section not found"). Read everything under the section's tenant.
  const sectionMeta = await fetchSectionById(sectionId);
  const tenantId = sectionMeta?.tenantId ?? sectionMeta?.workspaceId;
  if (!tenantId) throw ApiError.notFound('Section not found');

  const { section, studentEnrollments, quizLinks } = await withTenant(
    tenantId,
    user.id,
    async (tx) => ({
      section: await tx.query.sections.findFirst({
        where: and(eq(sections.id, sectionId), activeOnly(sections.deletedAt)),
        with: { course: true },
      }),
      studentEnrollments: await tx.query.studentSections.findMany({
        where: and(
          eq(studentSections.sectionId, sectionId),
          eq(studentSections.status, 'ACTIVE'),
        ),
        with: { student: true },
      }),
      quizLinks: await tx.query.quizSections.findMany({
        where: eq(quizSections.sectionId, sectionId),
        with: { quiz: true },
      }),
    }),
  );
  if (!section) throw ApiError.notFound('Section not found');

  await logGradebookAccess({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    sectionId,
    role: user.platformStaff ? 'ADMIN' : 'PROFESSOR',
  });

  const students = studentEnrollments
    .map((e) => e.student)
    .sort((a, b) => comparePersonsByLastName(a, b));

  const sectionQuizzes = quizLinks
    .map((qs) => qs.quiz)
    .filter(
      (q): q is NonNullable<(typeof quizLinks)[0]['quiz']> =>
        q != null && q.deletedAt == null,
    );

  const scores = await buildGradebookScoresForSection({
    sectionId,
    quizIds: sectionQuizzes.map((q) => q.id),
    enrolledStudentIds: students.map((s) => s.id),
  });

  return {
    section: {
      id: section.id,
      name: section.name,
      courseTitle: section.course?.title ?? null,
    },
    quizzes: sectionQuizzes.map((q) => ({ id: q.id, title: q.title })),
    learners: students.map((student) => {
      const cells: GradebookData['learners'][number]['cells'] = {};
      const percentages: number[] = [];
      for (const quiz of sectionQuizzes) {
        const cell = scores[student.id]?.[quiz.id];
        if (cell) {
          cells[quiz.id] = cell;
          percentages.push(cell.percentage);
        }
      }
      return {
        id: student.id,
        name: personName(student),
        email: student.email,
        average:
          percentages.length > 0
            ? Math.round(
                percentages.reduce((sum, p) => sum + p, 0) / percentages.length,
              )
            : null,
        cells,
      };
    }),
  };
}

export type AttemptSummary = {
  id: string;
  student: { id: string; name: string; email: string | null };
  section: { id: string; name: string };
  score: number | null;
  maxScore: number;
  percentage: number | null;
  passed: boolean | null;
  gradingStatus: string | null;
  submittedAt: Date | null;
};

export async function listQuizAttempts(
  user: ProfessorUser,
  quizId: string,
  options: { sectionId?: string } = {},
): Promise<AttemptSummary[]> {
  const allowed = await professorCanAccessQuiz(user, quizId);
  if (!allowed) throw ApiError.forbidden('You do not have access to this quiz');

  // Binding-based section scope (platform staff only with a support grant,
  // enforced inside authorize()). professor_sections is not consulted.
  const sectionIds = await accessibleQuizSectionIds(user, quizId);

  const rows = await fetchSubmittedAttemptsForProfessorSections({
    quizId,
    professorSectionIds: sectionIds,
    restrictToSectionId: options.sectionId,
  });

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'education.attempts.list',
    targetType: 'quiz',
    targetId: quizId,
    metadata: {
      viewerRole: user.platformStaff ? 'ADMIN' : 'PROFESSOR',
      sectionId: options.sectionId ?? null,
      rowCount: rows.length,
    },
  });

  return rows.map((a) => ({
    id: a.id,
    student: {
      id: a.student.id,
      name: personName(a.student),
      email: a.student.email,
    },
    section: { id: a.section.id, name: a.section.name },
    score: a.score,
    maxScore: a.maxScore,
    percentage: a.percentage,
    passed: a.passed,
    gradingStatus: a.gradingStatus,
    submittedAt: a.submittedAt,
  }));
}

export type AttemptDetail = AttemptSummary & {
  quiz: { id: string; title: string };
  startedAt: Date;
  answers: unknown;
  gptFeedback: unknown;
};

export async function getAttemptDetail(
  user: ProfessorUser,
  attemptId: string,
): Promise<AttemptDetail> {
  // FORCE RLS: a plain db read finds no attempt. Find its section and tenant
  // via the definer, check access, then read the details under the tenant.
  const found = await loadAttemptForGrading(attemptId);
  if (!found?.tenantId) throw ApiError.notFound('Attempt not found');
  await assertTeachesSection(user, found.sectionId);

  const attempt = await withTenant(found.tenantId, user.id, (tx) =>
    tx.query.attempts.findFirst({
      where: eq(attempts.id, attemptId),
      with: {
        student: true,
        quiz: { columns: { id: true, title: true } },
        section: { columns: { id: true, name: true } },
      },
    }),
  );
  if (!attempt) throw ApiError.notFound('Attempt not found');

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'education.attempt.view',
    targetType: 'attempt',
    targetId: attemptId,
    metadata: {
      viewerRole: user.platformStaff ? 'ADMIN' : 'PROFESSOR',
    },
  });

  return {
    id: attempt.id,
    student: {
      id: attempt.student.id,
      name: personName(attempt.student),
      email: attempt.student.email,
    },
    section: { id: attempt.section.id, name: attempt.section.name },
    quiz: { id: attempt.quiz.id, title: attempt.quiz.title },
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage,
    passed: attempt.passed,
    gradingStatus: attempt.gradingStatus,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    answers: attempt.answers,
    gptFeedback: attempt.gptFeedback,
  };
}

/**
 * CSV of submitted attempts across the professor's sections. Mirrors
 * GET /api/professor/quiz/export (PROFESSOR only, audited).
 */
const CSV_FIELDS = [
  'Student Name',
  'Student Email',
  'Quiz Name',
  'Attempt Date',
  'Score',
  'Max Score',
  'Attempt Number',
] as const;

export async function exportResultsCsv(
  user: ProfessorUser,
  options: {
    quizId?: string;
    dateFrom?: string;
    dateTo?: string;
    /** Where the export came from, for the audit log. */
    audit?: { via?: string; ip?: string | null; userAgent?: string | null };
    /** CSV with only the header row when nothing matched (file downloads). */
    headerOnlyWhenEmpty?: boolean;
  } = {},
): Promise<{ csv: string; rowCount: number }> {
  const sectionIds = await listTeachingSectionIds(user);
  if (sectionIds.length === 0) throw ApiError.forbidden('No section access');

  // FORCE RLS: plain db reads return nothing, so exports were always "No quiz
  // access". A teacher's sections can span tenants: read each under its own.
  const byTenant = await groupSectionIdsByTenant(sectionIds);
  const quizIdsByTenant = new Map<string, string[]>();
  for (const [tenantId, ids] of byTenant) {
    const links = await withTenant(tenantId, user.id, (tx) =>
      tx.query.quizSections.findMany({
        where: inArray(quizSections.sectionId, ids),
        columns: { quizId: true },
      }),
    );
    quizIdsByTenant.set(tenantId, [...new Set(links.map((l) => l.quizId))]);
  }
  const allowedQuizIds = [...quizIdsByTenant.values()].flat();
  if (allowedQuizIds.length === 0) throw ApiError.forbidden('No quiz access');
  if (options.quizId && !allowedQuizIds.includes(options.quizId)) {
    throw ApiError.forbidden('Access denied for this quiz');
  }

  const perTenant = await Promise.all(
    [...quizIdsByTenant].map(([tenantId, quizIds]) => {
      const whereConditions = [
        inArray(attempts.quizId, quizIds),
        isNotNull(attempts.submittedAt),
      ];
      if (options.quizId) whereConditions.push(eq(attempts.quizId, options.quizId));
      if (options.dateFrom) {
        whereConditions.push(gte(attempts.submittedAt, new Date(options.dateFrom)));
      }
      if (options.dateTo) {
        whereConditions.push(
          lte(attempts.submittedAt, new Date(options.dateTo + 'T23:59:59')),
        );
      }
      if (quizIds.length === 0) return Promise.resolve([]);
      return withTenant(tenantId, user.id, (tx) =>
        tx
          .select({
            studentFirstName: users.firstName,
            studentLastName: users.lastName,
            studentEmail: users.email,
            quizTitle: quizzes.title,
            attemptDate: attempts.submittedAt,
            score: attempts.score,
            maxScore: attempts.maxScore,
          })
          .from(attempts)
          .innerJoin(quizzes, eq(attempts.quizId, quizzes.id))
          .innerJoin(users, eq(attempts.studentId, users.id))
          .where(and(...whereConditions)),
      );
    }),
  );
  const time = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  const results = perTenant
    .flat()
    .sort((a, b) => time(a.attemptDate) - time(b.attemptDate));

  const attemptCounts = new Map<string, number>();
  const csvData = results.map((row) => {
    const key = `${row.studentEmail}-${row.quizTitle}`;
    attemptCounts.set(key, (attemptCounts.get(key) || 0) + 1);
    const fullName =
      [row.studentFirstName, row.studentLastName].filter(Boolean).join(' ') ||
      'Unknown';
    return {
      'Student Name': fullName,
      'Student Email': row.studentEmail,
      'Quiz Name': row.quizTitle,
      'Attempt Date': row.attemptDate
        ? new Date(row.attemptDate).toISOString()
        : 'N/A',
      Score: row.score ?? 0,
      'Max Score': row.maxScore ?? 0,
      'Attempt Number': attemptCounts.get(key) || 1,
    };
  });

  const csv =
    csvData.length > 0
      ? toCsv(csvData, {
          fields: [...CSV_FIELDS],
        })
      : options.headerOnlyWhenEmpty
        ? CSV_FIELDS.map((f) => `"${f}"`).join(',')
        : 'No submitted attempts matched the filters.';

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'education.grades.export',
    targetType: 'quiz',
    targetId: options.quizId ?? 'all',
    metadata: {
      rowCount: csvData.length,
      dateFrom: options.dateFrom || null,
      dateTo: options.dateTo || null,
      sectionCount: sectionIds.length,
      via: options.audit?.via ?? 'mcp',
    },
    ip: options.audit?.ip ?? undefined,
    userAgent: options.audit?.userAgent ?? undefined,
  });

  return { csv, rowCount: csvData.length };
}
