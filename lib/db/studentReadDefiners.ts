/**
 * Student-facing reads under FORCE RLS (drizzle/0097_force_rls_remaining_pack.sql).
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import type {
  InteractiveBody,
  InteractiveKind,
} from '@/app/db/schema';
import { asDate, parseJsonb, rowsFromExecute } from '@/lib/db/rows';
import { asUuidArray } from '@/lib/db/sqlArrays';

function mapLesson(raw: Record<string, unknown>) {
  const chapterRaw = raw.chapter;
  return {
    id: String(raw.id),
    professorId: raw.professor_id
      ? String(raw.professor_id)
      : raw.professorId
        ? String(raw.professorId)
        : null,
    courseId: String(raw.course_id ?? raw.courseId),
    tenantId: raw.tenant_id
      ? String(raw.tenant_id)
      : raw.tenantId
        ? String(raw.tenantId)
        : null,
    title: String(raw.title ?? ''),
    markdown: String(raw.markdown ?? ''),
    chapter:
      chapterRaw && typeof chapterRaw === 'object' && !Array.isArray(chapterRaw)
        ? (chapterRaw as import('@/app/db/schema').InteractiveChapterBody)
        : null,
    isActive: Boolean(raw.is_active ?? raw.isActive),
    sourceOutlineItemId: raw.source_outline_item_id
      ? String(raw.source_outline_item_id)
      : raw.sourceOutlineItemId
        ? String(raw.sourceOutlineItemId)
        : null,
    deletedAt: asDate(
      (raw.deleted_at ?? raw.deletedAt) as Date | string | null | undefined,
    ),
    createdAt: asDate(
      (raw.created_at ?? raw.createdAt) as Date | string | null | undefined,
    ),
    updatedAt: asDate(
      (raw.updated_at ?? raw.updatedAt) as Date | string | null | undefined,
    ),
  };
}

export type LessonRow = NonNullable<ReturnType<typeof mapLesson>>;

export async function fetchLessonByIdDefiner(
  lessonId: string,
): Promise<ReturnType<typeof mapLesson> | null> {
  const result = await db.execute(sql`
    SELECT sol_lesson_by_id(${lessonId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) return null;
  return mapLesson(raw);
}

export async function fetchLessonSectionIdsDefiner(
  lessonId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT sol_lesson_section_ids(${lessonId}::uuid) AS ids
  `);
  const ids = rowsFromExecute<{ ids: unknown }>(result)[0]?.ids;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id));
}

export async function fetchStudentLessonsForSectionsDefiner(
  sectionIds: string[],
): Promise<
  Array<{
    id: string;
    title: string;
    courseTitle: string;
    sectionName: string;
    sectionId: string;
    flashcardCount: number;
  }>
> {
  if (sectionIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT sol_student_lessons_for_sections(${asUuidArray(sectionIds)}) AS rows
  `);
  const raw = parseJsonb<
    Array<{
      id: string;
      title: string;
      courseTitle?: string | null;
      sectionName?: string | null;
      sectionId: string;
      flashcardCount?: number | null;
    }>
  >(rowsFromExecute<{ rows: unknown }>(result)[0]?.rows);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    courseTitle: r.courseTitle ?? '',
    sectionName: r.sectionName ?? '',
    sectionId: String(r.sectionId),
    flashcardCount: Number(r.flashcardCount ?? 0),
  }));
}

export async function fetchLessonFlashcardsDefiner(
  lessonId: string,
): Promise<Array<{ id: string; front: string; back: string; position: number }>> {
  const result = await db.execute(sql`
    SELECT sol_lesson_flashcards(${lessonId}::uuid) AS rows
  `);
  const raw = parseJsonb<
    Array<{ id: string; front: string; back: string; position: number }>
  >(rowsFromExecute<{ rows: unknown }>(result)[0]?.rows);
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({
    id: String(c.id),
    front: String(c.front ?? ''),
    back: String(c.back ?? ''),
    position: Number(c.position ?? 0),
  }));
}

export async function fetchLessonProgressForStudentDefiner(
  lessonId: string,
  studentId: string,
): Promise<{
  status: string;
  completedAt: Date | null;
} | null> {
  const result = await db.execute(sql`
    SELECT sol_lesson_progress_for_student(
      ${lessonId}::uuid,
      ${studentId}::uuid
    ) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) return null;
  return {
    status: String(raw.status),
    completedAt: asDate(
      (raw.completed_at ?? raw.completedAt) as Date | string | null | undefined,
    ),
  };
}

export async function upsertLessonProgressDefiner(payload: {
  lessonId: string;
  studentId: string;
  status: 'STARTED' | 'COMPLETED';
}): Promise<{ status: string; completedAt: Date | null }> {
  const result = await db.execute(sql`
    SELECT sol_upsert_lesson_progress(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) throw new Error('sol_upsert_lesson_progress returned no row');
  return {
    status: String(raw.status),
    completedAt: asDate(
      (raw.completed_at ?? raw.completedAt) as Date | string | null | undefined,
    ),
  };
}

export type ChapterSectionProgressRow = {
  sectionId: string;
  attempts: number;
  passed: boolean;
  lastSubmittedAt: Date | null;
};

export async function listChapterSectionProgressDefiner(
  lessonId: string,
  studentId: string,
): Promise<ChapterSectionProgressRow[]> {
  const result = await db.execute(sql`
    SELECT sol_list_chapter_section_progress(
      ${lessonId}::uuid,
      ${studentId}::uuid
    ) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map((row) => ({
    sectionId: String(row.section_id ?? row.sectionId ?? ''),
    attempts: Number(row.attempts ?? 0),
    passed: Boolean(row.passed),
    lastSubmittedAt: asDate(
      (row.last_submitted_at ?? row.lastSubmittedAt) as
        | Date
        | string
        | null
        | undefined,
    ),
  }));
}

export async function upsertChapterSectionProgressDefiner(payload: {
  lessonId: string;
  studentId: string;
  sectionId: string;
  passed: boolean;
}): Promise<ChapterSectionProgressRow> {
  const result = await db.execute(sql`
    SELECT sol_upsert_chapter_section_progress(
      ${JSON.stringify(payload)}::jsonb
    ) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) {
    throw new Error('sol_upsert_chapter_section_progress returned no row');
  }
  return {
    sectionId: String(raw.section_id ?? raw.sectionId ?? payload.sectionId),
    attempts: Number(raw.attempts ?? 0),
    passed: Boolean(raw.passed),
    lastSubmittedAt: asDate(
      (raw.last_submitted_at ?? raw.lastSubmittedAt) as
        | Date
        | string
        | null
        | undefined,
    ),
  };
}

function mapInteractive(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    professorId: raw.professor_id
      ? String(raw.professor_id)
      : raw.professorId
        ? String(raw.professorId)
        : null,
    courseId: String(raw.course_id ?? raw.courseId),
    tenantId: raw.tenant_id
      ? String(raw.tenant_id)
      : raw.tenantId
        ? String(raw.tenantId)
        : null,
    offeringId: raw.offering_id
      ? String(raw.offering_id)
      : raw.offeringId
        ? String(raw.offeringId)
        : null,
    title: String(raw.title ?? ''),
    description:
      raw.description != null ? String(raw.description) : null,
    kind: String(raw.kind ?? 'SCORM') as InteractiveKind,
    body: (raw.body ?? {}) as InteractiveBody,
    packageStorageKey: raw.package_storage_key
      ? String(raw.package_storage_key)
      : raw.packageStorageKey
        ? String(raw.packageStorageKey)
        : null,
    isActive: Boolean(raw.is_active ?? raw.isActive),
    sourceOutlineItemId: raw.source_outline_item_id
      ? String(raw.source_outline_item_id)
      : raw.sourceOutlineItemId
        ? String(raw.sourceOutlineItemId)
        : null,
    deletedAt: asDate(
      (raw.deleted_at ?? raw.deletedAt) as Date | string | null | undefined,
    ),
    createdAt: asDate(
      (raw.created_at ?? raw.createdAt) as Date | string | null | undefined,
    ) ?? new Date(),
    updatedAt: asDate(
      (raw.updated_at ?? raw.updatedAt) as Date | string | null | undefined,
    ) ?? new Date(),
  };
}

export async function fetchInteractiveByIdDefiner(interactiveId: string) {
  const result = await db.execute(sql`
    SELECT sol_interactive_by_id(${interactiveId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) return null;
  return mapInteractive(raw);
}

export async function fetchStudentInteractivesForSectionsDefiner(
  sectionIds: string[],
): Promise<
  Array<{
    id: string;
    title: string;
    kind: string;
    courseId: string;
    isActive: boolean;
  }>
> {
  if (sectionIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT sol_student_interactives_for_sections(${asUuidArray(sectionIds)}) AS rows
  `);
  const raw = parseJsonb<
    Array<{
      id: string;
      title: string;
      kind: string;
      courseId: string;
      isActive: boolean;
    }>
  >(rowsFromExecute<{ rows: unknown }>(result)[0]?.rows);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    kind: String(r.kind ?? ''),
    courseId: String(r.courseId),
    isActive: Boolean(r.isActive),
  }));
}

function mapChatbot(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    professorId: raw.professor_id
      ? String(raw.professor_id)
      : raw.professorId
        ? String(raw.professorId)
        : null,
    tenantId: raw.tenant_id
      ? String(raw.tenant_id)
      : raw.tenantId
        ? String(raw.tenantId)
        : null,
    offeringId: raw.offering_id
      ? String(raw.offering_id)
      : raw.offeringId
        ? String(raw.offeringId)
        : null,
    title: String(raw.title ?? ''),
    description: raw.description != null ? String(raw.description) : null,
    personaName: String(raw.persona_name ?? raw.personaName ?? ''),
    instructions: String(raw.instructions ?? ''),
    systemPrompt: String(raw.system_prompt ?? raw.systemPrompt ?? ''),
    relatedQuizId: raw.related_quiz_id
      ? String(raw.related_quiz_id)
      : raw.relatedQuizId
        ? String(raw.relatedQuizId)
        : null,
    isActive: Boolean(raw.is_active ?? raw.isActive),
    isTemplate: Boolean(raw.is_template ?? raw.isTemplate),
    model: String(raw.model ?? 'gpt-4.1-mini'),
    aiPolicy: (raw.ai_policy ?? raw.aiPolicy ?? null) as {
      mode: 'hints' | 'guided' | 'full_after_submit';
    } | null,
    deletedAt: asDate(
      (raw.deleted_at ?? raw.deletedAt) as Date | string | null | undefined,
    ),
  };
}

export async function fetchChatbotByIdDefiner(chatbotId: string) {
  const result = await db.execute(sql`
    SELECT sol_chatbot_by_id(${chatbotId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw?.id) return null;
  return mapChatbot(raw);
}

export async function fetchChatbotSectionIdsDefiner(
  chatbotId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT sol_chatbot_section_ids(${chatbotId}::uuid) AS ids
  `);
  const ids = rowsFromExecute<{ ids: unknown }>(result)[0]?.ids;
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id));
}

export async function fetchStudentQuizDueForSectionsDefiner(
  sectionIds: string[],
): Promise<
  Array<{
    quizId: string;
    title: string;
    startDate: Date | null;
    endDate: Date | null;
    isActive: boolean;
    sectionId: string;
    sectionName: string;
    courseTitle: string;
  }>
> {
  if (sectionIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT sol_student_quiz_due_for_sections(${asUuidArray(sectionIds)}) AS rows
  `);
  const raw = parseJsonb<
    Array<{
      quizId: string;
      title: string;
      startDate?: Date | string | null;
      endDate?: Date | string | null;
      isActive?: boolean;
      sectionId: string;
      sectionName?: string | null;
      courseTitle?: string | null;
    }>
  >(rowsFromExecute<{ rows: unknown }>(result)[0]?.rows);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    quizId: String(r.quizId),
    title: String(r.title ?? ''),
    startDate: asDate(r.startDate ?? null),
    endDate: asDate(r.endDate ?? null),
    isActive: Boolean(r.isActive),
    sectionId: String(r.sectionId),
    sectionName: r.sectionName ?? '',
    courseTitle: r.courseTitle ?? '',
  }));
}

export async function fetchStudentAssignmentDuesDefiner(
  studentId: string,
  quizIds: string[],
): Promise<Array<{ quizId: string; dueDate: Date | null }>> {
  if (quizIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT sol_student_assignment_dues(
      ${studentId}::uuid,
      ${asUuidArray(quizIds)}
    ) AS rows
  `);
  const raw = parseJsonb<
    Array<{ quizId: string; dueDate?: Date | string | null }>
  >(rowsFromExecute<{ rows: unknown }>(result)[0]?.rows);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    quizId: String(r.quizId),
    dueDate: asDate(r.dueDate ?? null),
  }));
}

export async function fetchLessonsForSectionContextDefiner(
  courseId: string,
  sectionId: string,
): Promise<
  Array<{ id: string; title: string; markdown: string; updatedAt: Date }>
> {
  const result = await db.execute(sql`
    SELECT sol_lessons_for_section_context(
      ${courseId}::uuid,
      ${sectionId}::uuid
    ) AS rows
  `);
  const raw = parseJsonb<
    Array<{
      id: string;
      title: string;
      markdown?: string | null;
      updatedAt?: Date | string | null;
    }>
  >(rowsFromExecute<{ rows: unknown }>(result)[0]?.rows);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    markdown: String(r.markdown ?? ''),
    updatedAt: asDate(r.updatedAt ?? null) ?? new Date(0),
  }));
}
