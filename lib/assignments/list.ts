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
      return withBasePath(`/quiz/${row.quizId}`);
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

  const [qs, ls, cs, is] = await Promise.all([
    db.query.quizSections.findMany({
      where: inArray(quizSections.sectionId, sectionIds),
      columns: { quizId: true, sectionId: true },
    }),
    db.query.lessonSections.findMany({
      where: inArray(lessonSections.sectionId, sectionIds),
      columns: { lessonId: true, sectionId: true },
    }),
    db.query.chatbotSections.findMany({
      where: inArray(chatbotSections.sectionId, sectionIds),
      columns: { chatbotId: true, sectionId: true },
    }),
    db.query.interactiveSections.findMany({
      where: inArray(interactiveSections.sectionId, sectionIds),
      columns: { interactiveId: true, sectionId: true },
    }),
  ]);

  const quizIds = [...new Set(qs.map((r) => r.quizId))];
  const lessonIds = [...new Set(ls.map((r) => r.lessonId))];
  const chatbotIds = [...new Set(cs.map((r) => r.chatbotId))];
  const interactiveIds = [...new Set(is.map((r) => r.interactiveId))];

  const entityFilters = [
    quizIds.length ? inArray(courseActivities.quizId, quizIds) : undefined,
    lessonIds.length ? inArray(courseActivities.lessonId, lessonIds) : undefined,
    chatbotIds.length
      ? inArray(courseActivities.chatbotId, chatbotIds)
      : undefined,
    interactiveIds.length
      ? inArray(courseActivities.interactiveId, interactiveIds)
      : undefined,
  ].filter((x): x is NonNullable<typeof x> => x != null);

  if (entityFilters.length === 0) return [];

  const rows = await db.query.courseActivities.findMany({
    where: and(
      isNull(courseActivities.deletedAt),
      eq(courseActivities.isActive, true),
      type !== 'ALL' ? eq(courseActivities.type, type) : undefined,
      or(...entityFilters),
    ),
    with: {
      course: true,
      interactive: true,
      quiz: {
        columns: {
          id: true,
          maxAttempts: true,
          startDate: true,
          endDate: true,
        },
      },
    },
    orderBy: (t, { desc }) => desc(t.updatedAt),
  });

  const sectionsByEntity = await sectionMapForActivities(rows);

  const [quizAttempts, lessonProg, chatAssign, interactiveProg] =
    await Promise.all([
      quizIds.length
        ? db.query.attempts.findMany({
            where: and(
              eq(attempts.studentId, studentId),
              inArray(attempts.quizId, quizIds),
              isNotNull(attempts.submittedAt),
            ),
            columns: {
              quizId: true,
              percentage: true,
              score: true,
              maxScore: true,
            },
          })
        : Promise.resolve([]),
      lessonIds.length
        ? db.query.lessonProgress.findMany({
            where: and(
              eq(lessonProgress.studentId, studentId),
              inArray(lessonProgress.lessonId, lessonIds),
            ),
          })
        : Promise.resolve([]),
      chatbotIds.length
        ? db.query.chatbotAssignments.findMany({
            where: and(
              eq(chatbotAssignments.studentId, studentId),
              inArray(chatbotAssignments.chatbotId, chatbotIds),
            ),
          })
        : Promise.resolve([]),
      interactiveIds.length
        ? db.query.interactiveProgress.findMany({
            where: and(
              eq(interactiveProgress.studentId, studentId),
              inArray(interactiveProgress.interactiveId, interactiveIds),
            ),
          })
        : Promise.resolve([]),
    ]);

  const bestQuiz = new Map<string, number>();
  const attemptCounts = new Map<string, number>();
  for (const a of quizAttempts) {
    attemptCounts.set(a.quizId, (attemptCounts.get(a.quizId) ?? 0) + 1);
    const pct =
      a.percentage ??
      (a.maxScore ? Math.round(((a.score ?? 0) / a.maxScore) * 100) : 0);
    const prev = bestQuiz.get(a.quizId);
    if (prev == null || pct > prev) bestQuiz.set(a.quizId, pct);
  }
  const lessonStatus = new Map(lessonProg.map((p) => [p.lessonId, p.status]));
  const chatStatus = new Map(
    chatAssign.map((p) => [p.chatbotId, p.isCompleted]),
  );
  const interactiveStatus = new Map(
    interactiveProg.map((p) => [p.interactiveId, p.status]),
  );

  return rows.map((row) => {
    const secs = sectionsByEntity.get(entityKey(row)) ?? {
      ids: [],
      names: [],
    };
    let completionStatus: ActivityCompletionStatus = 'NOT_STARTED';
    let bestPercentage: number | null = null;
    let attemptCount: number | null = null;
    let maxAttempts: number | null = null;

    const quizStart = row.quiz?.startDate
      ? new Date(row.quiz.startDate).toISOString()
      : null;
    const quizEnd = row.quiz?.endDate
      ? new Date(row.quiz.endDate).toISOString()
      : null;
    const startDate = row.startDate
      ? new Date(row.startDate).toISOString()
      : quizStart;
    const endDate = row.endDate
      ? new Date(row.endDate).toISOString()
      : quizEnd;

    if (row.type === 'QUIZ' && row.quizId) {
      const pct = bestQuiz.get(row.quizId);
      attemptCount = attemptCounts.get(row.quizId) ?? 0;
      maxAttempts = row.quiz?.maxAttempts ?? null;
      if (pct != null) {
        completionStatus = 'SCORED';
        bestPercentage = pct;
      }
    } else if (row.type === 'LESSON' && row.lessonId) {
      const st = lessonStatus.get(row.lessonId);
      if (st === 'COMPLETED') completionStatus = 'COMPLETED';
      else if (st === 'STARTED') completionStatus = 'IN_PROGRESS';
    } else if (row.type === 'DISCUSSION' && row.chatbotId) {
      if (chatStatus.get(row.chatbotId)) completionStatus = 'COMPLETED';
      else if (chatStatus.has(row.chatbotId)) completionStatus = 'IN_PROGRESS';
    } else if (row.type === 'INTERACTIVE' && row.interactiveId) {
      const st = interactiveStatus.get(row.interactiveId);
      if (st === 'COMPLETED') completionStatus = 'COMPLETED';
      else if (st === 'STARTED') completionStatus = 'IN_PROGRESS';
    }

    return {
      id: row.id,
      type: row.type as ActivityType,
      title: row.title,
      description: row.description,
      courseId: row.courseId,
      courseTitle: row.course?.title ?? null,
      professorId: row.professorId,
      isActive: row.isActive,
      startDate,
      endDate,
      position: row.position,
      quizId: row.quizId,
      lessonId: row.lessonId,
      chatbotId: row.chatbotId,
      interactiveId: row.interactiveId,
      interactiveKind: row.interactive?.kind ?? null,
      sectionIds: secs.ids.filter((id) => sectionIds.includes(id)),
      sectionNames: secs.names,
      href: hrefFor(row),
      completionStatus,
      bestPercentage,
      attemptCount,
      maxAttempts,
    };
  });
}
