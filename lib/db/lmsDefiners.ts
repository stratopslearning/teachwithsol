/**
 * Canvas-like LMS DEFINER accessors (FORCE RLS).
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
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

function asDate(v: unknown): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(String(v));
}

function mapSnake<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = v;
  }
  return out as T;
}

export type CourseModuleRow = {
  id: string;
  courseId: string;
  tenantId: string;
  title: string;
  position: number;
  published: boolean;
  unlockAt: Date | null;
  prerequisiteModuleIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ModuleItemRow = {
  id: string;
  moduleId: string;
  tenantId: string;
  position: number;
  title: string;
  isHeader: boolean;
  type: string;
  lessonId: string | null;
  quizId: string | null;
  chatbotId: string | null;
  interactiveId: string | null;
  pageId: string | null;
  peerDiscussionId: string | null;
  materialId: string | null;
  externalUrl: string | null;
  completionRequirement: {
    type: 'view' | 'submit' | 'score_at_least';
    minPercent?: number;
  } | null;
  published: boolean;
};

function mapModule(raw: Record<string, unknown>): CourseModuleRow {
  const m = mapSnake<Record<string, unknown>>(raw);
  return {
    id: String(m.id),
    courseId: String(m.courseId),
    tenantId: String(m.tenantId),
    title: String(m.title ?? ''),
    position: Number(m.position ?? 0),
    published: Boolean(m.published),
    unlockAt: asDate(m.unlockAt),
    prerequisiteModuleIds: Array.isArray(m.prerequisiteModuleIds)
      ? (m.prerequisiteModuleIds as string[])
      : [],
    createdAt: asDate(m.createdAt) ?? new Date(),
    updatedAt: asDate(m.updatedAt) ?? new Date(),
  };
}

function mapItem(raw: Record<string, unknown>): ModuleItemRow {
  const m = mapSnake<Record<string, unknown>>(raw);
  return {
    id: String(m.id),
    moduleId: String(m.moduleId),
    tenantId: String(m.tenantId),
    position: Number(m.position ?? 0),
    title: String(m.title ?? ''),
    isHeader: Boolean(m.isHeader),
    type: String(m.type ?? 'HEADER'),
    lessonId: m.lessonId != null ? String(m.lessonId) : null,
    quizId: m.quizId != null ? String(m.quizId) : null,
    chatbotId: m.chatbotId != null ? String(m.chatbotId) : null,
    interactiveId: m.interactiveId != null ? String(m.interactiveId) : null,
    pageId: m.pageId != null ? String(m.pageId) : null,
    peerDiscussionId:
      m.peerDiscussionId != null ? String(m.peerDiscussionId) : null,
    materialId: m.materialId != null ? String(m.materialId) : null,
    externalUrl: m.externalUrl != null ? String(m.externalUrl) : null,
    completionRequirement: (m.completionRequirement as ModuleItemRow['completionRequirement']) ?? null,
    published: Boolean(m.published),
  };
}

export async function listCourseModulesDefiner(
  courseId: string,
): Promise<CourseModuleRow[]> {
  const result = await db.execute(sql`
    SELECT sol_list_course_modules(${courseId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map(mapModule);
}

export async function listModuleItemsDefiner(
  moduleId: string,
): Promise<ModuleItemRow[]> {
  const result = await db.execute(sql`
    SELECT sol_list_module_items(${moduleId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map(mapItem);
}

export async function upsertCourseModuleDefiner(payload: {
  id?: string;
  courseId: string;
  title?: string;
  position?: number;
  published?: boolean;
  unlockAt?: string | null;
  prerequisiteModuleIds?: string[];
}): Promise<CourseModuleRow | null> {
  const result = await db.execute(sql`
    SELECT sol_upsert_course_module(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return raw ? mapModule(raw) : null;
}

export async function softDeleteCourseModuleDefiner(
  courseId: string,
  moduleId: string,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT sol_soft_delete_course_module(
      ${courseId}::uuid,
      ${moduleId}::uuid
    ) AS id
  `);
  const id = rowsFromExecute<{ id: string }>(result)[0]?.id;
  if (!id) throw new Error('sol_soft_delete_course_module returned no id');
  return id;
}

export async function upsertModuleItemDefiner(payload: {
  id?: string;
  moduleId: string;
  title?: string;
  position?: number;
  isHeader?: boolean;
  type?: string;
  lessonId?: string | null;
  quizId?: string | null;
  chatbotId?: string | null;
  interactiveId?: string | null;
  pageId?: string | null;
  peerDiscussionId?: string | null;
  materialId?: string | null;
  externalUrl?: string | null;
  completionRequirement?: ModuleItemRow['completionRequirement'];
  published?: boolean;
}): Promise<ModuleItemRow | null> {
  const result = await db.execute(sql`
    SELECT sol_upsert_module_item(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return raw ? mapItem(raw) : null;
}

export async function assignModuleSectionsDefiner(
  moduleId: string,
  sectionIds: string[],
): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_assign_module_sections(
      ${moduleId}::uuid,
      ${asUuidArray(sectionIds)}
    ) AS count
  `);
  return Number(rowsFromExecute<{ count: number }>(result)[0]?.count ?? 0);
}

export async function getCourseLmsNavDefiner(courseId: string): Promise<{
  navigation: unknown;
  syllabusMarkdown: string | null;
  tenantId: string;
} | null> {
  const result = await db.execute(sql`
    SELECT sol_get_course_lms_nav(${courseId}::uuid) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  if (!raw) return null;
  return {
    navigation: raw.navigation,
    syllabusMarkdown:
      raw.syllabusMarkdown != null ? String(raw.syllabusMarkdown) : null,
    tenantId: String(raw.tenantId),
  };
}

export async function updateCourseLmsSettingsDefiner(payload: {
  courseId: string;
  navigation?: unknown;
  syllabusMarkdown?: string | null;
}): Promise<{ navigation: unknown; syllabusMarkdown: string | null }> {
  const result = await db.execute(sql`
    SELECT sol_update_course_lms_settings(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return {
    navigation: raw?.navigation ?? null,
    syllabusMarkdown:
      raw?.syllabusMarkdown != null ? String(raw.syllabusMarkdown) : null,
  };
}

export async function listCoursePagesDefiner(courseId: string) {
  const result = await db.execute(sql`
    SELECT sol_list_course_pages(${courseId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map((r) => mapSnake(r));
}

export async function upsertCoursePageDefiner(payload: Record<string, unknown>) {
  const result = await db.execute(sql`
    SELECT sol_upsert_course_page(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return raw ? mapSnake(raw) : null;
}

export async function listCourseAnnouncementsDefiner(courseId: string) {
  const result = await db.execute(sql`
    SELECT sol_list_course_announcements(${courseId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map((r) => mapSnake(r));
}

export async function createCourseAnnouncementDefiner(
  payload: Record<string, unknown>,
) {
  const result = await db.execute(sql`
    SELECT sol_create_course_announcement(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return raw ? mapSnake(raw) : null;
}

export async function listPeerDiscussionsDefiner(courseId: string) {
  const result = await db.execute(sql`
    SELECT sol_list_peer_discussions(${courseId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map((r) => mapSnake(r));
}

export async function upsertPeerDiscussionDefiner(
  payload: Record<string, unknown>,
) {
  const result = await db.execute(sql`
    SELECT sol_upsert_peer_discussion(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return raw ? mapSnake(raw) : null;
}

export async function listAssignmentGroupsDefiner(courseId: string) {
  const result = await db.execute(sql`
    SELECT sol_list_assignment_groups(${courseId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map((r) => mapSnake(r));
}

export async function upsertAssignmentGroupDefiner(
  payload: Record<string, unknown>,
) {
  const result = await db.execute(sql`
    SELECT sol_upsert_assignment_group(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return raw ? mapSnake(raw) : null;
}

export async function listLearningOutcomesDefiner(courseId: string) {
  const result = await db.execute(sql`
    SELECT sol_list_learning_outcomes(${courseId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map((r) => mapSnake(r));
}

export async function upsertLearningOutcomeDefiner(
  payload: Record<string, unknown>,
) {
  const result = await db.execute(sql`
    SELECT sol_upsert_learning_outcome(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return raw ? mapSnake(raw) : null;
}

export async function listCourseRubricsDefiner(courseId: string) {
  const result = await db.execute(sql`
    SELECT sol_list_course_rubrics(${courseId}::uuid) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map((r) => mapSnake(r));
}

export async function upsertCourseRubricDefiner(
  payload: Record<string, unknown>,
) {
  const result = await db.execute(sql`
    SELECT sol_upsert_course_rubric(${JSON.stringify(payload)}::jsonb) AS row
  `);
  const raw = parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
  return raw ? mapSnake(raw) : null;
}

export async function completeModuleItemDefiner(payload: {
  moduleItemId: string;
  studentId: string;
}) {
  const result = await db.execute(sql`
    SELECT sol_complete_module_item(${JSON.stringify(payload)}::jsonb) AS row
  `);
  return parseJsonb(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
}

export async function listModuleItemProgressDefiner(
  studentId: string,
  moduleIds: string[],
) {
  const result = await db.execute(sql`
    SELECT sol_list_module_item_progress(
      ${studentId}::uuid,
      ${asUuidArray(moduleIds)}
    ) AS rows
  `);
  const raw = parseJsonb<Record<string, unknown>[]>(
    rowsFromExecute<{ rows: unknown }>(result)[0]?.rows,
  );
  return (raw ?? []).map((r) => mapSnake(r));
}

export async function backfillModulesFromOutlineDefiner(outlineId: string) {
  const result = await db.execute(sql`
    SELECT sol_backfill_modules_from_outline(${outlineId}::uuid) AS row
  `);
  return parseJsonb<Record<string, unknown>>(
    rowsFromExecute<{ row: unknown }>(result)[0]?.row,
  );
}
