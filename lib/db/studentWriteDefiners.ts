/**
 * Student FORCE RLS write/CRUD helpers (drizzle/0109_student_force_rls_crud.sql).
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import type {
  assignments,
  attempts,
  chatbotAssignments,
  chatbotSessions,
  interactiveProgress,
  questions,
  quizzes,
  quizSections,
  sections,
} from '@/app/db/schema';
import { asUuidArray } from '@/lib/db/sqlArrays';

function rowsFromExecute<T>(result: unknown): T[] {
  return (
    (result as { rows?: T[] }).rows ??
    (Array.isArray(result) ? (result as T[]) : [])
  );
}

function parseJsonb<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return raw as T;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

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

function mapAssignment(
  raw: Record<string, unknown> | null | undefined,
): typeof assignments.$inferSelect | undefined {
  if (!raw?.id && !raw?.quiz_id && !raw?.quizId) return undefined;
  return {
    id: String(pick(raw, 'id', 'id')),
    quizId: String(pick(raw, 'quiz_id', 'quizId')),
    studentId: String(pick(raw, 'student_id', 'studentId')),
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    offeringId: pick<string | null>(raw, 'offering_id', 'offeringId') ?? null,
    dueDate: asDate(pick(raw, 'due_date', 'dueDate') as Date | string | null),
    isCompleted: Boolean(pick(raw, 'is_completed', 'isCompleted')),
    assignedAt:
      asDate(pick(raw, 'assigned_at', 'assignedAt') as Date | string | null) ??
      new Date(0),
    completedAt: asDate(
      pick(raw, 'completed_at', 'completedAt') as Date | string | null,
    ),
  };
}

function mapQuiz(
  raw: Record<string, unknown> | null | undefined,
): typeof quizzes.$inferSelect | undefined {
  if (!raw?.id) return undefined;
  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    description: (pick(raw, 'description', 'description') as string | null) ?? null,
    professorId: String(pick(raw, 'professor_id', 'professorId') ?? ''),
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    offeringId: pick<string | null>(raw, 'offering_id', 'offeringId') ?? null,
    maxAttempts: Number(pick(raw, 'max_attempts', 'maxAttempts') ?? 1),
    timeLimit: pick<number | null>(raw, 'time_limit', 'timeLimit') ?? null,
    passingScore: Number(pick(raw, 'passing_score', 'passingScore') ?? 60),
    startDate: asDate(pick(raw, 'start_date', 'startDate') as Date | string | null),
    endDate: asDate(pick(raw, 'end_date', 'endDate') as Date | string | null),
    isActive: Boolean(pick(raw, 'is_active', 'isActive') ?? true),
    gradesReleasedAt: asDate(
      pick(raw, 'grades_released_at', 'gradesReleasedAt') as Date | string | null,
    ),
    sourceOutlineItemId:
      pick<string | null>(raw, 'source_outline_item_id', 'sourceOutlineItemId') ??
      null,
    deletedAt: asDate(pick(raw, 'deleted_at', 'deletedAt') as Date | string | null),
    createdAt:
      asDate(pick(raw, 'created_at', 'createdAt') as Date | string | null) ??
      new Date(0),
    updatedAt:
      asDate(pick(raw, 'updated_at', 'updatedAt') as Date | string | null) ??
      new Date(0),
  };
}

function mapAttempt(
  raw: Record<string, unknown> | null | undefined,
): typeof attempts.$inferSelect | undefined {
  if (!raw?.id) return undefined;
  return {
    id: String(raw.id),
    assignmentId: String(pick(raw, 'assignment_id', 'assignmentId')),
    studentId: String(pick(raw, 'student_id', 'studentId')),
    quizId: String(pick(raw, 'quiz_id', 'quizId')),
    sectionId: String(pick(raw, 'section_id', 'sectionId')),
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    offeringId: pick<string | null>(raw, 'offering_id', 'offeringId') ?? null,
    quizVersionId:
      pick<string | null>(raw, 'quiz_version_id', 'quizVersionId') ?? null,
    answers: (pick(raw, 'answers', 'answers') as Record<string, unknown>) ?? {},
    score: pick<number | null>(raw, 'score', 'score') ?? null,
    maxScore: Number(pick(raw, 'max_score', 'maxScore') ?? 0),
    percentage: pick<number | null>(raw, 'percentage', 'percentage') ?? null,
    passed: pick<boolean | null>(raw, 'passed', 'passed') ?? null,
    gptFeedback: pick(raw, 'gpt_feedback', 'gptFeedback') ?? null,
    gradingStatus:
      (pick(raw, 'grading_status', 'gradingStatus') as
        | 'complete'
        | 'partial'
        | 'failed'
        | null) ?? null,
    startedAt:
      asDate(pick(raw, 'started_at', 'startedAt') as Date | string | null) ??
      new Date(0),
    submittedAt: asDate(
      pick(raw, 'submitted_at', 'submittedAt') as Date | string | null,
    ),
  };
}

function mapQuizSection(
  raw: Record<string, unknown>,
): typeof quizSections.$inferSelect {
  return {
    id: String(pick(raw, 'id', 'id') ?? ''),
    quizId: String(pick(raw, 'quiz_id', 'quizId')),
    sectionId: String(pick(raw, 'section_id', 'sectionId')),
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    offeringId: pick<string | null>(raw, 'offering_id', 'offeringId') ?? null,
    assignedBy: String(pick(raw, 'assigned_by', 'assignedBy') ?? ''),
    assignedAt:
      asDate(pick(raw, 'assigned_at', 'assignedAt') as Date | string | null) ??
      new Date(0),
  };
}

function mapQuestion(
  raw: Record<string, unknown>,
): typeof questions.$inferSelect {
  return {
    id: String(raw.id),
    quizId: String(pick(raw, 'quiz_id', 'quizId')),
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    offeringId: pick<string | null>(raw, 'offering_id', 'offeringId') ?? null,
    type: String(pick(raw, 'type', 'type')) as
      | 'MULTIPLE_CHOICE'
      | 'TRUE_FALSE'
      | 'SHORT_ANSWER',
    question: String(pick(raw, 'question', 'question') ?? ''),
    options: pick(raw, 'options', 'options') ?? null,
    correctAnswer:
      pick<string | null>(raw, 'correct_answer', 'correctAnswer') ?? null,
    points: Number(pick(raw, 'points', 'points') ?? 1),
    order: Number(pick(raw, 'order', 'order') ?? 0),
    rubric: pick(raw, 'rubric', 'rubric') ?? null,
    rubricVersion: Number(pick(raw, 'rubric_version', 'rubricVersion') ?? 1),
    rubricStatus: String(pick(raw, 'rubric_status', 'rubricStatus') ?? 'none'),
    rubricApprovedAt: asDate(
      pick(raw, 'rubric_approved_at', 'rubricApprovedAt') as Date | string | null,
    ),
    rubricApprovedBy:
      pick<string | null>(raw, 'rubric_approved_by', 'rubricApprovedBy') ?? null,
    conceptTags: (pick(raw, 'concept_tags', 'conceptTags') as string[]) ?? [],
    createdAt:
      asDate(pick(raw, 'created_at', 'createdAt') as Date | string | null) ??
      new Date(0),
  };
}

function mapSection(
  raw: Record<string, unknown> | null | undefined,
): typeof sections.$inferSelect | null {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    courseId: String(pick(raw, 'course_id', 'courseId') ?? ''),
    offeringId: pick<string | null>(raw, 'offering_id', 'offeringId') ?? null,
    workspaceId: pick<string | null>(raw, 'workspace_id', 'workspaceId') ?? null,
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    name: String(pick(raw, 'name', 'name') ?? ''),
    professorEnrollmentCode: String(
      pick(raw, 'professor_enrollment_code', 'professorEnrollmentCode') ?? '',
    ),
    studentEnrollmentCode: String(
      pick(raw, 'student_enrollment_code', 'studentEnrollmentCode') ?? '',
    ),
    isActive: Boolean(pick(raw, 'is_active', 'isActive') ?? true),
    endsAt: asDate(pick(raw, 'ends_at', 'endsAt') as Date | string | null),
    deletedAt: asDate(pick(raw, 'deleted_at', 'deletedAt') as Date | string | null),
    createdAt:
      asDate(pick(raw, 'created_at', 'createdAt') as Date | string | null) ??
      new Date(0),
    updatedAt:
      asDate(pick(raw, 'updated_at', 'updatedAt') as Date | string | null) ??
      new Date(0),
  };
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

function mapInteractiveProgress(
  raw: Record<string, unknown> | null,
): typeof interactiveProgress.$inferSelect | null {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    interactiveId: String(pick(raw, 'interactive_id', 'interactiveId')),
    studentId: String(pick(raw, 'student_id', 'studentId')),
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    status: String(pick(raw, 'status', 'status')) as 'STARTED' | 'COMPLETED',
    completedAt: asDate(
      pick(raw, 'completed_at', 'completedAt') as Date | string | null,
    ),
    xapiSummary:
      (pick(raw, 'xapi_summary', 'xapiSummary') as Record<string, unknown> | null) ??
      null,
    updatedAt:
      asDate(pick(raw, 'updated_at', 'updatedAt') as Date | string | null) ??
      new Date(0),
    createdAt:
      asDate(pick(raw, 'created_at', 'createdAt') as Date | string | null) ??
      new Date(0),
  };
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

function mapChatbotAssignment(
  raw: Record<string, unknown> | null | undefined,
): typeof chatbotAssignments.$inferSelect | null {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    chatbotId: String(pick(raw, 'chatbot_id', 'chatbotId')),
    studentId: String(pick(raw, 'student_id', 'studentId')),
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    offeringId: pick<string | null>(raw, 'offering_id', 'offeringId') ?? null,
    isCompleted: Boolean(pick(raw, 'is_completed', 'isCompleted')),
    assignedAt:
      asDate(pick(raw, 'assigned_at', 'assignedAt') as Date | string | null) ??
      new Date(0),
    completedAt: asDate(
      pick(raw, 'completed_at', 'completedAt') as Date | string | null,
    ),
  };
}

function mapChatbotSession(
  raw: Record<string, unknown> | null | undefined,
): typeof chatbotSessions.$inferSelect | null {
  if (!raw?.id) return null;
  return {
    id: String(raw.id),
    assignmentId: String(pick(raw, 'assignment_id', 'assignmentId')),
    studentId: String(pick(raw, 'student_id', 'studentId')),
    chatbotId: String(pick(raw, 'chatbot_id', 'chatbotId')),
    sectionId: String(pick(raw, 'section_id', 'sectionId')),
    tenantId: pick<string | null>(raw, 'tenant_id', 'tenantId') ?? null,
    offeringId: pick<string | null>(raw, 'offering_id', 'offeringId') ?? null,
    messages: (pick(raw, 'messages', 'messages') as unknown[]) ?? [],
    sessionMetadata:
      (pick(raw, 'session_metadata', 'sessionMetadata') as Record<
        string,
        unknown
      >) ?? {},
    struggleTopics:
      (pick(raw, 'struggle_topics', 'struggleTopics') as string[]) ?? [],
    status: String(pick(raw, 'status', 'status')) as
      | 'in_progress'
      | 'completed',
    startedAt:
      asDate(pick(raw, 'started_at', 'startedAt') as Date | string | null) ??
      new Date(0),
    completedAt: asDate(
      pick(raw, 'completed_at', 'completedAt') as Date | string | null,
    ),
  };
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
