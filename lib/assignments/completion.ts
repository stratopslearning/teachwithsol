import { and, eq, inArray } from 'drizzle-orm';

import { withSectionTenant } from '@/lib/db/sectionTenants';
import {
  chatbotAssignments,
  chatbotSections,
  interactiveProgress,
  interactiveSections,
  lessonProgress,
  lessonSections,
} from '@/app/db/schema';

export type CompletionColumn = {
  id: string;
  type: 'LESSON' | 'DISCUSSION' | 'INTERACTIVE';
  title: string;
  entityId: string;
};

export type StudentCompletionMap = Record<
  string,
  Record<string, 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'>
>;

/** Completion columns for a section gradebook (non-quiz). */
export async function listSectionCompletionColumns(
  sectionId: string,
): Promise<CompletionColumn[]> {
  // FORCE RLS: plain db reads return nothing (no completion columns ever
  // showed). Read under the section's tenant.
  const [ls, cs, is] = (await withSectionTenant(sectionId, null, (tx) =>
    Promise.all([
      tx.query.lessonSections.findMany({
        where: eq(lessonSections.sectionId, sectionId),
        with: { lesson: true },
      }),
      tx.query.chatbotSections.findMany({
        where: eq(chatbotSections.sectionId, sectionId),
        with: { chatbot: true },
      }),
      tx.query.interactiveSections.findMany({
        where: eq(interactiveSections.sectionId, sectionId),
        with: { interactive: true },
      }),
    ]),
  )) ?? [[], [], []];

  const cols: CompletionColumn[] = [];
  for (const row of ls) {
    if (!row.lesson || row.lesson.deletedAt || !row.lesson.isActive) continue;
    cols.push({
      id: `lesson:${row.lessonId}`,
      type: 'LESSON',
      title: row.lesson.title,
      entityId: row.lessonId,
    });
  }
  for (const row of cs) {
    if (!row.chatbot || row.chatbot.deletedAt || !row.chatbot.isActive) continue;
    cols.push({
      id: `discussion:${row.chatbotId}`,
      type: 'DISCUSSION',
      title: row.chatbot.title,
      entityId: row.chatbotId,
    });
  }
  for (const row of is) {
    if (
      !row.interactive ||
      row.interactive.deletedAt ||
      !row.interactive.isActive
    )
      continue;
    cols.push({
      id: `interactive:${row.interactiveId}`,
      type: 'INTERACTIVE',
      title: row.interactive.title,
      entityId: row.interactiveId,
    });
  }
  return cols;
}

export async function buildCompletionMapForSection(opts: {
  sectionId: string;
  columns: CompletionColumn[];
  studentIds: string[];
}): Promise<StudentCompletionMap> {
  const { columns, studentIds } = opts;
  const map: StudentCompletionMap = {};
  for (const sid of studentIds) map[sid] = {};

  if (studentIds.length === 0 || columns.length === 0) return map;

  const lessonIds = columns
    .filter((c) => c.type === 'LESSON')
    .map((c) => c.entityId);
  const chatbotIds = columns
    .filter((c) => c.type === 'DISCUSSION')
    .map((c) => c.entityId);
  const interactiveIds = columns
    .filter((c) => c.type === 'INTERACTIVE')
    .map((c) => c.entityId);

  const [lp, ca, ip] = (await withSectionTenant(opts.sectionId, null, (tx) =>
    Promise.all([
      lessonIds.length
        ? tx.query.lessonProgress.findMany({
            where: and(
              inArray(lessonProgress.lessonId, lessonIds),
              inArray(lessonProgress.studentId, studentIds),
            ),
          })
        : Promise.resolve([]),
      chatbotIds.length
        ? tx.query.chatbotAssignments.findMany({
            where: and(
              inArray(chatbotAssignments.chatbotId, chatbotIds),
              inArray(chatbotAssignments.studentId, studentIds),
            ),
          })
        : Promise.resolve([]),
      interactiveIds.length
        ? tx.query.interactiveProgress.findMany({
            where: and(
              inArray(interactiveProgress.interactiveId, interactiveIds),
              inArray(interactiveProgress.studentId, studentIds),
            ),
          })
        : Promise.resolve([]),
    ]),
  )) ?? [[], [], []];

  for (const col of columns) {
    for (const sid of studentIds) {
      map[sid][col.id] = 'NOT_STARTED';
    }
  }

  for (const row of lp) {
    const colId = `lesson:${row.lessonId}`;
    if (!map[row.studentId]) continue;
    map[row.studentId][colId] =
      row.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
  }
  for (const row of ca) {
    const colId = `discussion:${row.chatbotId}`;
    if (!map[row.studentId]) continue;
    map[row.studentId][colId] = row.isCompleted
      ? 'COMPLETED'
      : 'IN_PROGRESS';
  }
  for (const row of ip) {
    const colId = `interactive:${row.interactiveId}`;
    if (!map[row.studentId]) continue;
    map[row.studentId][colId] =
      row.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
  }

  return map;
}
