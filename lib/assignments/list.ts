import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  attempts,
  chatbotAssignments,
  chatbotSections,
  courseActivities,
  interactiveProgress,
  interactiveSections,
  lessonProgress,
  lessonSections,
  quizSections,
} from '@/app/db/schema';
import { withBasePath } from '@/lib/basePath';
import type {
  ActivityCompletionStatus,
  ActivityListItem,
  ActivityType,
} from '@/lib/assignments/types';

function hrefFor(row: {
  type: string;
  quizId: string | null;
  lessonId: string | null;
  chatbotId: string | null;
  interactiveId: string | null;
}): string {
  switch (row.type) {
    case 'QUIZ':
      return withBasePath(`/dashboard/student/quiz/${row.quizId}`);
    case 'LESSON':
      return withBasePath(`/dashboard/student/lessons/${row.lessonId}`);
    case 'DISCUSSION':
      return withBasePath(`/chatbot/${row.chatbotId}`);
    case 'INTERACTIVE':
      return withBasePath(`/interactive/${row.interactiveId}`);
    default:
      return withBasePath('/dashboard/student/assignments');
  }
}

function professorHrefFor(row: {
  type: string;
  courseId?: string | null;
  quizId: string | null;
  lessonId: string | null;
  chatbotId: string | null;
  interactiveId: string | null;
}): string {
  switch (row.type) {
    case 'QUIZ':
      return withBasePath(`/dashboard/professor/quiz/${row.quizId}/edit`);
    case 'LESSON':
      if (row.courseId && row.lessonId) {
        return withBasePath(
          `/dashboard/professor/courses/${row.courseId}/lessons/${row.lessonId}`,
        );
      }
      return row.courseId
        ? withBasePath(
            `/dashboard/professor/courses/${row.courseId}/assignments`,
          )
        : withBasePath('/dashboard/professor/courses');
    case 'DISCUSSION':
      return withBasePath(`/dashboard/professor/discussions/${row.chatbotId}`);
    case 'INTERACTIVE':
      return withBasePath(
        `/dashboard/professor/interactive/${row.interactiveId}/edit`,
      );
    default:
      return row.courseId
        ? withBasePath(
            `/dashboard/professor/courses/${row.courseId}/assignments`,
          )
        : withBasePath('/dashboard/professor/courses');
  }
}

async function sectionMapForActivities(
  activities: Array<{
    type: string;
    quizId: string | null;
    lessonId: string | null;
    chatbotId: string | null;
    interactiveId: string | null;
  }>,
) {
  const quizIds = activities
    .map((a) => a.quizId)
    .filter((id): id is string => Boolean(id));
  const lessonIds = activities
    .map((a) => a.lessonId)
    .filter((id): id is string => Boolean(id));
  const chatbotIds = activities
    .map((a) => a.chatbotId)
    .filter((id): id is string => Boolean(id));
  const interactiveIds = activities
    .map((a) => a.interactiveId)
    .filter((id): id is string => Boolean(id));

  const [qs, ls, cs, is] = await Promise.all([
    quizIds.length
      ? db.query.quizSections.findMany({
          where: inArray(quizSections.quizId, quizIds),
          with: { section: true },
        })
      : Promise.resolve([]),
    lessonIds.length
      ? db.query.lessonSections.findMany({
          where: inArray(lessonSections.lessonId, lessonIds),
          with: { section: true },
        })
      : Promise.resolve([]),
    chatbotIds.length
      ? db.query.chatbotSections.findMany({
          where: inArray(chatbotSections.chatbotId, chatbotIds),
          with: { section: true },
        })
      : Promise.resolve([]),
    interactiveIds.length
      ? db.query.interactiveSections.findMany({
          where: inArray(interactiveSections.interactiveId, interactiveIds),
          with: { section: true },
        })
      : Promise.resolve([]),
  ]);

  const map = new Map<string, { ids: string[]; names: string[] }>();
  const add = (key: string, sectionId: string, name: string) => {
    const cur = map.get(key) ?? { ids: [], names: [] };
    if (!cur.ids.includes(sectionId)) {
      cur.ids.push(sectionId);
      cur.names.push(name);
    }
    map.set(key, cur);
  };

  for (const row of qs) {
    add(`QUIZ:${row.quizId}`, row.sectionId, row.section?.name ?? 'Section');
  }
  for (const row of ls) {
    add(`LESSON:${row.lessonId}`, row.sectionId, row.section?.name ?? 'Section');
  }
  for (const row of cs) {
    add(
      `DISCUSSION:${row.chatbotId}`,
      row.sectionId,
      row.section?.name ?? 'Section',
    );
  }
  for (const row of is) {
    add(
      `INTERACTIVE:${row.interactiveId}`,
      row.sectionId,
      row.section?.name ?? 'Section',
    );
  }
  return map;
}

function entityKey(a: {
  type: string;
  quizId: string | null;
  lessonId: string | null;
  chatbotId: string | null;
  interactiveId: string | null;
}) {
  if (a.type === 'QUIZ' && a.quizId) return `QUIZ:${a.quizId}`;
  if (a.type === 'LESSON' && a.lessonId) return `LESSON:${a.lessonId}`;
  if (a.type === 'DISCUSSION' && a.chatbotId) return `DISCUSSION:${a.chatbotId}`;
  if (a.type === 'INTERACTIVE' && a.interactiveId)
    return `INTERACTIVE:${a.interactiveId}`;
  return a.type;
}

/** Course-hub list: all activities registered on this course (any professor). */
export async function listCourseActivities(opts: {
  courseId: string;
  type?: ActivityType | 'ALL';
}): Promise<ActivityListItem[]> {
  const { courseId, type = 'ALL' } = opts;

  // FORCE RLS: bare course_activities / section joins return [] without GUC.
  const { fetchCourseActivitiesDefiner } = await import(
    '@/lib/db/entityScopedReads'
  );
  const rows = await fetchCourseActivitiesDefiner(courseId);
  const filtered =
    type === 'ALL' ? rows : rows.filter((row) => row.type === type);

  return filtered.map((row) => ({
    id: row.id,
    type: row.type as ActivityType,
    title: row.title,
    description: row.description,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    professorId: row.professorId,
    isActive: row.isActive,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    position: row.position,
    quizId: row.quizId,
    lessonId: row.lessonId,
    chatbotId: row.chatbotId,
    interactiveId: row.interactiveId,
    interactiveKind: row.interactiveKind,
    sectionIds: row.sectionIds,
    sectionNames: row.sectionNames,
    href: professorHrefFor(row),
  }));
}

export async function listProfessorActivities(opts: {
  professorId: string;
  sectionIds: string[];
  type?: ActivityType | 'ALL';
}): Promise<ActivityListItem[]> {
  const { professorId, sectionIds, type = 'ALL' } = opts;
  if (sectionIds.length === 0) return [];

  const rows = await db.query.courseActivities.findMany({
    where: and(
      eq(courseActivities.professorId, professorId),
      isNull(courseActivities.deletedAt),
      type !== 'ALL' ? eq(courseActivities.type, type) : undefined,
    ),
    with: {
      course: true,
      interactive: true,
    },
    orderBy: (t, { desc }) => desc(t.updatedAt),
  });

  const sectionsByEntity = await sectionMapForActivities(rows);
  const filtered = rows.filter((row) => {
    const secs = sectionsByEntity.get(entityKey(row));
    if (!secs) return false;
    return secs.ids.some((id) => sectionIds.includes(id));
  });

  return filtered.map((row) => {
    const secs = sectionsByEntity.get(entityKey(row)) ?? {
      ids: [],
      names: [],
    };
    return {
      id: row.id,
      type: row.type as ActivityType,
      title: row.title,
      description: row.description,
      courseId: row.courseId,
      courseTitle: row.course?.title ?? null,
      professorId: row.professorId,
      isActive: row.isActive,
      startDate: row.startDate ? new Date(row.startDate).toISOString() : null,
      endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
      position: row.position,
      quizId: row.quizId,
      lessonId: row.lessonId,
      chatbotId: row.chatbotId,
      interactiveId: row.interactiveId,
      interactiveKind: row.interactive?.kind ?? null,
      sectionIds: secs.ids,
      sectionNames: secs.names,
      href: professorHrefFor(row),
    };
  });
}

export async function listStudentActivities(opts: {
  studentId: string;
  sectionIds: string[];
  type?: ActivityType | 'ALL';
}): Promise<ActivityListItem[]> {
  const { studentId, sectionIds, type = 'ALL' } = opts;
  if (sectionIds.length === 0) return [];

  const { fetchStudentActivitiesBundleDefiner } = await import(
    '@/lib/db/studentWriteDefiners'
  );
  const rows = await fetchStudentActivitiesBundleDefiner(
    studentId,
    sectionIds,
    type === 'ALL' ? null : type,
  );

  return rows.map((row) => {
    let completionStatus: ActivityCompletionStatus = 'NOT_STARTED';
    let bestPercentage: number | null = null;
    let attemptCount: number | null = null;
    let maxAttempts: number | null = null;

    const quizStart = row.quizStartDate
      ? row.quizStartDate.toISOString()
      : null;
    const quizEnd = row.quizEndDate ? row.quizEndDate.toISOString() : null;
    const startDate = row.startDate ? row.startDate.toISOString() : quizStart;
    const endDate = row.endDate ? row.endDate.toISOString() : quizEnd;

    if (row.type === 'QUIZ' && row.quizId) {
      attemptCount = row.quizProgress?.attemptCount ?? 0;
      maxAttempts = row.maxAttempts;
      if (row.quizProgress?.bestPercentage != null) {
        completionStatus = 'SCORED';
        bestPercentage = row.quizProgress.bestPercentage;
      }
    } else if (row.type === 'LESSON' && row.lessonId) {
      if (row.lessonStatus === 'COMPLETED') completionStatus = 'COMPLETED';
      else if (row.lessonStatus === 'STARTED') completionStatus = 'IN_PROGRESS';
    } else if (row.type === 'DISCUSSION' && row.chatbotId) {
      if (row.chatbotCompleted) completionStatus = 'COMPLETED';
      else if (row.chatbotAssigned) completionStatus = 'IN_PROGRESS';
    } else if (row.type === 'INTERACTIVE' && row.interactiveId) {
      if (row.interactiveStatus === 'COMPLETED') completionStatus = 'COMPLETED';
      else if (row.interactiveStatus === 'STARTED')
        completionStatus = 'IN_PROGRESS';
    }

    return {
      id: row.id,
      type: row.type as ActivityType,
      title: row.title,
      description: row.description,
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      professorId: row.professorId,
      isActive: row.isActive,
      startDate,
      endDate,
      position: row.position,
      quizId: row.quizId,
      lessonId: row.lessonId,
      chatbotId: row.chatbotId,
      interactiveId: row.interactiveId,
      interactiveKind: row.interactiveKind,
      sectionIds: row.sections.map((s) => s.id),
      sectionNames: row.sections.map((s) => s.name),
      href: hrefFor(row),
      completionStatus,
      bestPercentage,
      attemptCount,
      maxAttempts,
    };
  });
}
