/**
 * Frozen copies of the hand-written row mappers that rowFromTable replaced
 * (lib/db/studentWriteDefiners.ts before #80). rowFromTable.test.ts checks
 * the generic mapper still produces the same rows.
 */
/* eslint-disable */
import type {
  assignments,
  attempts,
  ChatbotMessage,
  chatbotAssignments,
  chatbotSessions,
  interactiveProgress,
  questions,
  quizzes,
  quizSections,
  sections,
} from '@/app/db/schema';
import { asDate } from '@/lib/db/rows';
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

export function mapQuiz(
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
    passingScore: Number(pick(raw, 'passing_score', 'passingScore') ?? DEFAULT_PASSING_SCORE),
    startDate: asDate(pick(raw, 'start_date', 'startDate') as Date | string | null),
    endDate: asDate(pick(raw, 'end_date', 'endDate') as Date | string | null),
    isActive: Boolean(pick(raw, 'is_active', 'isActive') ?? true),
    hideFeedbackAfterDue: Boolean(
      pick(raw, 'hide_feedback_after_due', 'hideFeedbackAfterDue') ?? false,
    ),
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

export function mapAttempt(
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

export function mapQuizSection(
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

export function mapQuestion(
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

export function mapSection(
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

export function mapInteractiveProgress(
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

export function mapChatbotAssignment(
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

export function mapChatbotSession(
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
    messages: (pick(raw, 'messages', 'messages') as ChatbotMessage[]) ?? [],
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
