import { eq } from 'drizzle-orm';

import { db } from '@/app/db';
import { lessons } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import {
  setActivityActiveByEntity,
  upsertActivityForLesson,
} from '@/lib/assignments/sync';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { userCanAccessTeachingArea } from '@/lib/authz/gates';
import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import {
  fetchLessonByIdDefiner,
  fetchLessonSectionIdsDefiner,
} from '@/lib/db/studentReadDefiners';
import type { UserData } from '@/lib/getOrCreateUser';

type AuthUser = Pick<UserData, 'id' | 'clerkId'> & {
  platformStaff?: boolean | null;
};

export type CreateLessonInput = {
  courseId: string;
  title: string;
  markdown: string;
  chapter?: import('@/app/db/schema').InteractiveChapterBody | null;
  sectionIds: string[];
  flashcards?: Array<{ front: string; back: string }>;
  sourceOutlineItemId?: string | null;
  isActive?: boolean;
};

export async function createLessonFromAuthoring(
  user: AuthUser,
  input: CreateLessonInput,
): Promise<{ id: string; title: string }> {
  if (!(await userCanAccessTeachingArea(user.id)) && !user.platformStaff) {
    throw ApiError.forbidden('Teaching access required');
  }
  const markdown = input.markdown.trim();
  const hasChapter =
    input.chapter &&
    input.chapter.kind === 'interactive_chapter' &&
    Array.isArray(input.chapter.sections) &&
    input.chapter.sections.length > 0;
  if (!markdown && !hasChapter) {
    throw ApiError.badRequest('Lesson markdown or chapter content is required');
  }
  if (input.sectionIds.length === 0) {
    throw ApiError.badRequest('Select at least one section');
  }

  const teachable = await listTeachableSectionIdsForCourse(
    user,
    input.courseId,
  );
  const allowed = new Set(teachable);
  const invalid = input.sectionIds.filter((id) => !allowed.has(id));
  if (invalid.length > 0) {
    throw ApiError.forbidden(
      'You can only assign lessons to sections you teach in this course',
    );
  }

  const { createLessonDefiner, assignLessonSectionsDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  // FORCE RLS: pass tenant so sol_create_lesson can see the course row.
  const { fetchCourseById } = await import('@/lib/db/entityScopedReads');
  const course = await fetchCourseById(input.courseId);
  const tenantId = course?.tenantId ?? course?.workspaceId ?? null;
  const created = await createLessonDefiner({
    courseId: input.courseId,
    professorId: user.id,
    title: input.title.trim(),
    markdown: markdown || input.title.trim(),
    chapter: hasChapter ? input.chapter : null,
    isActive: input.isActive ?? false,
    sourceOutlineItemId: input.sourceOutlineItemId ?? null,
    flashcards: (input.flashcards ?? []).filter(
      (c) => c.front?.trim() && c.back?.trim(),
    ),
    tenantId,
  });

  await assignLessonSectionsDefiner({
    lessonId: created.id,
    assignedBy: user.id,
    sectionIds: input.sectionIds,
  });

  await upsertActivityForLesson(created.id, {
    courseId: created.courseId,
    professorId: created.professorId,
    title: created.title,
    isActive: created.isActive,
    sourceOutlineItemId: created.sourceOutlineItemId,
    tenantId,
  });

  return { id: created.id, title: created.title };
}

/** Hook target: after visibility flip, Canvas line items may be created. */
export async function setLessonVisibility(
  user: AuthUser,
  lessonId: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  const existing = await fetchLessonByIdDefiner(lessonId);
  if (!existing) {
    throw ApiError.notFound('Lesson not found');
  }

  const linkSectionIds = await fetchLessonSectionIdsDefiner(lessonId);
  let canPublish = false;
  for (const sectionId of linkSectionIds) {
    if (await authorizeOnSection(user, 'content.publish', sectionId)) {
      canPublish = true;
      break;
    }
    if (await authorizeOnSection(user, 'content.write', sectionId)) {
      canPublish = true;
      break;
    }
  }
  const authorId = existing.professorId;
  if (
    !canPublish &&
    authorId &&
    authorId === user.id &&
    (await userCanAccessTeachingArea(user.id))
  ) {
    canPublish = true;
  }
  if (!canPublish) {
    throw ApiError.forbidden('Only teaching staff can change lesson visibility');
  }

  const [updated] = await db
    .update(lessons)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(lessons.id, lessonId))
    .returning();

  await setActivityActiveByEntity({ lessonId }, isActive);

  return { id: updated.id, isActive: updated.isActive };
}
