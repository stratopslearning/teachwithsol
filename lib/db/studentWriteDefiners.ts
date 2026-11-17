/**
 * Student FORCE RLS write/CRUD helpers (drizzle/0109_student_force_rls_crud.sql).
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  assignments,
  attempts,
  type ChatbotMessage,
  chatbotAssignments,
  chatbotSessions,
  interactiveProgress,
  questions,
  quizzes,
  quizSections,
  sections,
} from '@/app/db/schema';
import { asDate, parseJsonb, rowsFromExecute } from '@/lib/db/rows';
import { rowFromTable } from '@/lib/db/rowFromTable';
import { asUuidArray } from '@/lib/db/sqlArrays';
import { DEFAULT_PASSING_SCORE } from '@/lib/quiz/schemas';

function pick<T = unknown>(
  row: Record<string, unknown> | null | undefined,
  snake: string,
  camel: string,
): T | undefined {
  if (!row) return undefined;
  if (camel in row) return row[camel] as T;
  if (snake in row) return row[snake] as T;
  return undefined;
}

export function mapAssignment(
  raw: Record<string, unknown> | null | undefined,
): typeof assignments.$inferSelect | undefined {
  if (!raw?.id && !raw?.quiz_id && !raw?.quizId) return undefined;
  return rowFromTable(assignments, raw!);
}

export function mapQuiz(
  raw: Record<string, unknown> | null | undefined,
): typeof quizzes.$inferSelect | undefined {
  return raw?.id ? rowFromTable(quizzes, raw) : undefined;
}

export function mapAttempt(
  raw: Record<string, unknown> | null | undefined,
): typeof attempts.$inferSelect | undefined {
  return raw?.id ? rowFromTable(attempts, raw) : undefined;
}

export function mapQuizSection(raw: Record<string, unknown>): typeof quizSections.$inferSelect {
  return rowFromTable(quizSections, raw);
}

export function mapQuestion(raw: Record<string, unknown>): typeof questions.$inferSelect {
  return rowFromTable(questions, raw);
}

export function mapSection(
  raw: Record<string, unknown> | null | undefined,
): typeof sections.$inferSelect | null {
  return raw?.id ? rowFromTable(sections, raw) : null;
}

export async function loadExamContextDefiner(args: {
  quizId: string;
  assignmentId: string;
  studentId: string;
}) {
  const result = await db.execute(sql`
    SELECT sol_load_exam_context(
      ${args.quizId}::uuid,
      ${args.assignmentId}::uuid,
      ${args.studentId}::uuid
    ) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) {
    return {
      assignment: undefined,
      quiz: undefined,
      inProgressAttempt: undefined,
      submittedCount: 0,
      quizSectionLinks: [] as Array<typeof quizSections.$inferSelect>,
    };
  }
  const linksRaw = raw.quizSectionLinks;
  const links = Array.isArray(linksRaw)
    ? linksRaw.map((l) => mapQuizSection(l as Record<string, unknown>))
    : [];
  return {
    assignment: mapAssignment(
      raw.assignment as Record<string, unknown> | null,
    ),
    quiz: mapQuiz(raw.quiz as Record<string, unknown> | null),
    inProgressAttempt: mapAttempt(
      raw.inProgressAttempt as Record<string, unknown> | null,
    ),
    submittedCount: Number(raw.submittedCount ?? 0),
    quizSectionLinks: links,
  };
}

export async function resolveAttemptSectionDefiner(
  studentId: string,
  quizSectionIds: string[],
  preferredSectionId?: string | null,
): Promise<string | null> {
  if (quizSectionIds.length === 0) return null;
  const result = await db.execute(sql`
    SELECT sol_resolve_attempt_section(
      ${studentId}::uuid,
      ${asUuidArray(quizSectionIds)},
      ${preferredSectionId ?? null}::uuid
    ) AS id
  `);
  const id = rowsFromExecute<{ id: string | null }>(result)[0]?.id;
  return id ? String(id) : null;
}

export async function ensureQuizAssignmentDefiner(
  quizId: string,
  studentId: string,
  dueDate?: Date | null,
) {
  const result = await db.execute(sql`
    SELECT sol_ensure_quiz_assignment(
      ${quizId}::uuid,
      ${studentId}::uuid,
      ${dueDate ? dueDate.toISOString() : null}::timestamptz
    ) AS row
  `);
  return mapAssignment(
    parseJsonb<Record<string, unknown>>(
      rowsFromExecute<{ row: unknown }>(result)[0]?.row,
    ),
  );
}

export async function fetchQuizTakeBundleDefiner(
  quizId: string,
  studentId: string,
) {
  const result = await db.execute(sql`
    SELECT sol_quiz_take_bundle(
      ${quizId}::uuid,
      ${studentId}::uuid
    ) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) return null;

  const questionsRaw = Array.isArray(raw.questions) ? raw.questions : [];
  const sectionIdsRaw = Array.isArray(raw.quizSectionIds)
    ? raw.quizSectionIds
    : [];

  return {
    quiz: mapQuiz(raw.quiz as Record<string, unknown>),
    quizSectionIds: sectionIdsRaw.map((id) => String(id)),
    resolvedSectionId: raw.resolvedSectionId
      ? String(raw.resolvedSectionId)
      : null,
    section: mapSection(raw.section as Record<string, unknown> | null),
    assignment: mapAssignment(
      raw.assignment as Record<string, unknown> | null,
    ),
    questions: questionsRaw.map((q) =>
      mapQuestion(q as Record<string, unknown>),
    ),
    inProgressAttempt: mapAttempt(
      raw.inProgressAttempt as Record<string, unknown> | null,
    ),
  };
}

export async function updateAttemptAnswersDefiner(
  attemptId: string,
  studentId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT sol_update_attempt_answers(
      ${attemptId}::uuid,
      ${studentId}::uuid,
      ${JSON.stringify(answers)}::jsonb
    ) AS ok
  `);
  return Boolean(rowsFromExecute<{ ok: boolean }>(result)[0]?.ok);
}

export async function fetchAttemptWithQuizAssignmentDefiner(attemptId: string) {
  const result = await db.execute(sql`
    SELECT sol_attempt_with_quiz_assignment(${attemptId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) return null;
  return {
    attempt: mapAttempt(raw.attempt as Record<string, unknown>),
    quiz: mapQuiz(raw.quiz as Record<string, unknown> | null),
    assignment: mapAssignment(
      raw.assignment as Record<string, unknown> | null,
    ),
  };
}

export async function studentEnrolledInQuizDefiner(
  studentId: string,
  quizId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT sol_student_enrolled_in_quiz(
      ${studentId}::uuid,
      ${quizId}::uuid
    ) AS ok
  `);
  return Boolean(rowsFromExecute<{ ok: boolean }>(result)[0]?.ok);
}

export async function fetchQuizQuestionsSafeDefiner(quizId: string) {
  const result = await db.execute(sql`
    SELECT sol_quiz_questions_safe(${quizId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map(mapQuestion);
}

export type StudentGradebookAttempt = {
  id: string;
  quizId: string;
  sectionId: string;
  sectionName: string;
  quizTitle: string;
  courseTitle: string | null;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  sectionEndsAt: Date | null;
};

/** Every tenant a student has enrollments, attempts or chatbot sessions in. */
export async function fetchStudentTenantIdsDefiner(
  studentId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT sol_student_tenant_ids(${studentId}::uuid) AS ids
  `);
  const ids = rowsFromExecute<{ ids: unknown }>(result)[0]?.ids;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id));
}

export async function fetchStudentGradebookAttemptsDefiner(
  studentId: string,
): Promise<StudentGradebookAttempt[]> {
  const result = await db.execute(sql`
    SELECT sol_student_gradebook_attempts(${studentId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id: String(r.id),
    quizId: String(r.quizId ?? r.quiz_id),
    sectionId: String(r.sectionId ?? r.section_id),
    sectionName: String(r.sectionName ?? r.section_name ?? 'Section'),
    quizTitle: String(r.quizTitle ?? r.quiz_title ?? 'Quiz'),
    courseTitle: (r.courseTitle ?? r.course_title ?? null) as string | null,
    submittedAt: asDate(
      (r.submittedAt ?? r.submitted_at) as Date | string | null,
    ),
    score: (r.score as number | null) ?? null,
    maxScore: (r.maxScore ?? r.max_score ?? null) as number | null,
    percentage: (r.percentage as number | null) ?? null,
    passed: (r.passed as boolean | null) ?? null,
    sectionEndsAt: asDate(
      (r.sectionEndsAt ?? r.section_ends_at) as Date | string | null,
    ),
  }));
}

export type StudentActivityBundleRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  courseId: string | null;
  courseTitle: string | null;
  professorId: string;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
  position: number;
  quizId: string | null;
  lessonId: string | null;
  chatbotId: string | null;
  interactiveId: string | null;
  interactiveKind: string | null;
  maxAttempts: number | null;
  quizStartDate: Date | null;
  quizEndDate: Date | null;
  sections: Array<{ id: string; name: string }>;
  quizProgress: { bestPercentage: number | null; attemptCount: number } | null;
  lessonStatus: string | null;
  chatbotCompleted: boolean | null;
  chatbotAssigned: boolean;
  interactiveStatus: string | null;
};

export async function fetchStudentActivitiesBundleDefiner(
  studentId: string,
  sectionIds: string[],
  type?: string | null,
): Promise<StudentActivityBundleRow[]> {
  if (sectionIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT sol_student_activities_bundle(
      ${studentId}::uuid,
      ${asUuidArray(sectionIds)},
      ${type ?? null}::text
    ) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const secs = Array.isArray(r.sections) ? r.sections : [];
    const qp = r.quizProgress as Record<string, unknown> | null;
    return {
      id: String(r.id),
      type: String(r.type),
      title: String(r.title ?? ''),
      description: (r.description as string | null) ?? null,
      courseId: r.courseId ? String(r.courseId) : null,
      courseTitle: (r.courseTitle as string | null) ?? null,
      professorId: String(r.professorId ?? ''),
      isActive: Boolean(r.isActive),
      startDate: asDate(r.startDate as Date | string | null),
      endDate: asDate(r.endDate as Date | string | null),
      position: Number(r.position ?? 0),
      quizId: r.quizId ? String(r.quizId) : null,
      lessonId: r.lessonId ? String(r.lessonId) : null,
      chatbotId: r.chatbotId ? String(r.chatbotId) : null,
      interactiveId: r.interactiveId ? String(r.interactiveId) : null,
      interactiveKind: (r.interactiveKind as string | null) ?? null,
      maxAttempts: (r.maxAttempts as number | null) ?? null,
      quizStartDate: asDate(r.quizStartDate as Date | string | null),
      quizEndDate: asDate(r.quizEndDate as Date | string | null),
      sections: secs.map((s) => ({
        id: String((s as { id: string }).id),
        name: String((s as { name?: string }).name ?? ''),
      })),
      quizProgress: qp
        ? {
            bestPercentage: (qp.bestPercentage as number | null) ?? null,
            attemptCount: Number(qp.attemptCount ?? 0),
          }
        : null,
      lessonStatus: (r.lessonStatus as string | null) ?? null,
      chatbotCompleted: (r.chatbotCompleted as boolean | null) ?? null,
      chatbotAssigned: Boolean(r.chatbotAssigned),
      interactiveStatus: (r.interactiveStatus as string | null) ?? null,
    };
  });
}

export function mapInteractiveProgress(
  raw: Record<string, unknown> | null,
): typeof interactiveProgress.$inferSelect | null {
  return raw?.id ? rowFromTable(interactiveProgress, raw) : null;
}

export async function upsertInteractiveProgressDefiner(payload: {
  interactiveId: string;
  studentId: string;
  status: 'STARTED' | 'COMPLETED';
  xapiSummary?: Record<string, unknown> | null;
}) {
  const result = await db.execute(sql`
    SELECT sol_upsert_interactive_progress(${JSON.stringify({
      interactiveId: payload.interactiveId,
      studentId: payload.studentId,
      status: payload.status,
      xapiSummary: payload.xapiSummary ?? null,
    })}::jsonb) AS row
  `);
  const row = mapInteractiveProgress(
    parseJsonb<Record<string, unknown>>(
      rowsFromExecute<{ row: unknown }>(result)[0]?.row,
    ),
  );
  if (!row) throw new Error('sol_upsert_interactive_progress returned no row');
  return row;
}

export function mapChatbotAssignment(
  raw: Record<string, unknown> | null | undefined,
): typeof chatbotAssignments.$inferSelect | null {
  return raw?.id ? rowFromTable(chatbotAssignments, raw) : null;
}

export function mapChatbotSession(
  raw: Record<string, unknown> | null | undefined,
): typeof chatbotSessions.$inferSelect | null {
  return raw?.id ? rowFromTable(chatbotSessions, raw) : null;
}

export async function loadOrCreateChatbotSessionDefiner(payload: {
  chatbotId: string;
  studentId: string;
  sessionId?: string | null;
  sectionId?: string | null;
}) {
  const result = await db.execute(sql`
    SELECT sol_load_or_create_chatbot_session(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) return null;
  return {
    assignment: mapChatbotAssignment(
      raw.assignment as Record<string, unknown> | null,
    ),
    session: mapChatbotSession(raw.session as Record<string, unknown> | null),
    needsSection: Boolean(raw.needsSection),
  };
}

export async function updateChatbotSessionDefiner(payload: {
  sessionId: string;
  studentId: string;
  messages?: unknown;
  sessionMetadata?: Record<string, unknown>;
  struggleTopics?: string[];
  status?: 'in_progress' | 'completed';
}) {
  const result = await db.execute(sql`
    SELECT sol_update_chatbot_session(${JSON.stringify(payload)}::jsonb) AS row
  `);
  return mapChatbotSession(
    parseJsonb<Record<string, unknown>>(
      rowsFromExecute<{ row: unknown }>(result)[0]?.row,
    ),
  );
}

export async function completeChatbotSessionDefiner(
  sessionId: string,
  studentId: string,
) {
  const result = await db.execute(sql`
    SELECT sol_complete_chatbot_session(
      ${sessionId}::uuid,
      ${studentId}::uuid
    ) AS row
  `);
  return mapChatbotSession(
    parseJsonb<Record<string, unknown>>(
      rowsFromExecute<{ row: unknown }>(result)[0]?.row,
    ),
  );
}

export async function fetchChatbotSessionByIdDefiner(
  sessionId: string,
  studentId: string,
  chatbotId?: string | null,
) {
  const result = await db.execute(sql`
    SELECT sol_chatbot_session_by_id(
      ${sessionId}::uuid,
      ${studentId}::uuid,
      ${chatbotId ?? null}::uuid
    ) AS row
  `);
  return mapChatbotSession(
    parseJsonb<Record<string, unknown>>(
      rowsFromExecute<{ row: unknown }>(result)[0]?.row,
    ),
  );
}
