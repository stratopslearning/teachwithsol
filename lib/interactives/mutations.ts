import { and, eq } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  interactiveProgress,
  interactiveSections,
  interactives,
  type InteractiveBody,
  type InteractiveKind,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import {
  setActivityActiveByEntity,
  softDeleteActivityByEntity,
  upsertActivityForInteractive,
} from '@/lib/assignments/sync';
import { userCanAccessTeachingArea } from '@/lib/authz/gates';
import type { UserData } from '@/lib/getOrCreateUser';
import {
  assertCanManageInteractive,
  listTeachableSectionsForCourse,
} from '@/lib/interactives/access';

type AuthUser = Pick<UserData, 'id' | 'clerkId'> & {
  platformStaff?: boolean | null;
};

export async function createInteractive(
  user: AuthUser,
  input: {
    courseId: string;
    title: string;
    description?: string | null;
    kind: InteractiveKind;
    body?: InteractiveBody;
    sectionIds?: string[];
    isActive?: boolean;
    sourceOutlineItemId?: string | null;
  },
) {
  if (!(await userCanAccessTeachingArea(user.id)) && !user.platformStaff) {
    throw ApiError.forbidden('Teaching access required');
  }

  const teachable = await listTeachableSectionsForCourse(user, input.courseId);
  let sectionIds = input.sectionIds?.filter(Boolean) ?? [];
  if (sectionIds.length === 0) sectionIds = teachable;
  else {
    const allowed = new Set(teachable);
    if (sectionIds.some((id) => !allowed.has(id))) {
      throw ApiError.forbidden('Invalid section for this course');
    }
  }

  const { createInteractiveDefiner, setInteractiveSectionsDefiner } =
    await import('@/lib/db/facultyWriteDefiners');
  const { fetchCourseById } = await import('@/lib/db/entityScopedReads');
  const course = await fetchCourseById(input.courseId);
  const tenantId = course?.tenantId ?? course?.workspaceId ?? null;
  const row = await createInteractiveDefiner({
    courseId: input.courseId,
    professorId: user.id,
    title: input.title.trim(),
    description: input.description ?? null,
    kind: input.kind,
    body: (input.body ?? {}) as Record<string, unknown>,
    isActive: input.isActive ?? false,
    sourceOutlineItemId: input.sourceOutlineItemId ?? null,
    tenantId,
  });

  if (sectionIds.length > 0) {
    await setInteractiveSectionsDefiner({
      interactiveId: row.id,
      assignedBy: user.id,
      sectionIds,
    });
  }

  await upsertActivityForInteractive(row.id, {
    courseId: input.courseId,
    professorId: user.id,
    title: row.title,
    description: row.description,
    isActive: row.isActive,
    sourceOutlineItemId: row.sourceOutlineItemId,
  });

  return row;
}

export async function updateInteractive(
  user: AuthUser,
  interactiveId: string,
  input: {
    title?: string;
    description?: string | null;
    body?: InteractiveBody;
    kind?: InteractiveKind;
  },
) {
  const existing = await assertCanManageInteractive(user, interactiveId);
  const [row] = await db
    .update(interactives)
    .set({
      title: input.title?.trim() ?? existing.title,
      description:
        input.description !== undefined
          ? input.description
          : existing.description,
      body: input.body ?? existing.body,
      kind: input.kind ?? existing.kind,
      updatedAt: new Date(),
    })
    .where(eq(interactives.id, interactiveId))
    .returning();

  await upsertActivityForInteractive(row.id, {
    courseId: row.courseId,
    professorId: row.professorId,
    title: row.title,
    description: row.description,
    isActive: row.isActive,
    sourceOutlineItemId: row.sourceOutlineItemId,
  });

  return row;
}

/** Server-only: bind an S3 key after a trusted upload (H5P import). */
export async function setInteractivePackageStorageKey(
  user: AuthUser,
  interactiveId: string,
  packageStorageKey: string,
  body?: InteractiveBody,
) {
  const existing = await assertCanManageInteractive(user, interactiveId);
  const expectedPrefix = `courses/${existing.courseId}/interactives/${interactiveId}/`;
  if (!packageStorageKey.startsWith(expectedPrefix)) {
    throw ApiError.badRequest('Invalid package storage key for this course');
  }
  const [row] = await db
    .update(interactives)
    .set({
      packageStorageKey,
      body: body ?? existing.body,
      updatedAt: new Date(),
    })
    .where(eq(interactives.id, interactiveId))
    .returning();
  return row;
}

export async function setInteractiveVisibility(
  user: AuthUser,
  interactiveId: string,
  isActive: boolean,
) {
  await assertCanManageInteractive(user, interactiveId);
  const [row] = await db
    .update(interactives)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(interactives.id, interactiveId))
    .returning();
  await setActivityActiveByEntity({ interactiveId }, isActive);
  if (isActive) {
    const { onActivityReleased } = await import('@/lib/lti/lineItems');
    void onActivityReleased({ interactiveId });
  }
  return row;
}

export async function archiveInteractive(
  user: AuthUser,
  interactiveId: string,
) {
  await assertCanManageInteractive(user, interactiveId);
  await db
    .update(interactives)
    .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(eq(interactives.id, interactiveId));
  await softDeleteActivityByEntity({ interactiveId });
}

export async function assignInteractiveSections(
  user: AuthUser,
  interactiveId: string,
  sectionIds: string[],
) {
  const interactive = await assertCanManageInteractive(user, interactiveId);
  {
    const { requireCourseTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    await requireCourseTeaching(interactive.courseId, user);
  }
  const teachable = await listTeachableSectionsForCourse(
    user,
    interactive.courseId,
  );
  const allowed = new Set(teachable);
  const next = sectionIds.filter((id) => allowed.has(id));

  const { setInteractiveSectionsDefiner } = await import(
    '@/lib/db/facultyWriteDefiners'
  );
  await setInteractiveSectionsDefiner({
    interactiveId,
    assignedBy: user.id,
    sectionIds: next,
  });
}

export async function upsertInteractiveProgress(opts: {
  interactiveId: string;
  studentId: string;
  status: 'STARTED' | 'COMPLETED';
  xapiSummary?: Record<string, unknown> | null;
}) {
  const existing = await db.query.interactiveProgress.findFirst({
    where: and(
      eq(interactiveProgress.interactiveId, opts.interactiveId),
      eq(interactiveProgress.studentId, opts.studentId),
    ),
  });

  if (existing) {
    if (existing.status === 'COMPLETED' && opts.status === 'STARTED') {
      return existing;
    }
    const [row] = await db
      .update(interactiveProgress)
      .set({
        status: opts.status,
        completedAt:
          opts.status === 'COMPLETED' ? new Date() : existing.completedAt,
        xapiSummary: opts.xapiSummary ?? existing.xapiSummary,
        updatedAt: new Date(),
      })
      .where(eq(interactiveProgress.id, existing.id))
      .returning();
    if (opts.status === 'COMPLETED') {
      void enqueueInteractiveCompletionPassback(
        opts.studentId,
        opts.interactiveId,
      );
    }
    return row;
  }

  const [row] = await db
    .insert(interactiveProgress)
    .values({
      interactiveId: opts.interactiveId,
      studentId: opts.studentId,
      status: opts.status,
      completedAt: opts.status === 'COMPLETED' ? new Date() : null,
      xapiSummary: opts.xapiSummary ?? null,
    })
    .returning();
  if (opts.status === 'COMPLETED') {
    void enqueueInteractiveCompletionPassback(
      opts.studentId,
      opts.interactiveId,
    );
  }
  return row;
}

async function enqueueInteractiveCompletionPassback(
  studentId: string,
  interactiveId: string,
) {
  try {
    const { enqueueCompletionPassback } = await import('@/lib/lti/passback');
    const links = await db.query.interactiveSections.findMany({
      where: eq(interactiveSections.interactiveId, interactiveId),
    });
    for (const link of links) {
      void enqueueCompletionPassback({
        ref: { interactiveId },
        studentId,
        sectionId: link.sectionId,
        completed: true,
      });
    }
  } catch (err) {
    console.error('LTI interactive completion passback failed', err);
  }
}

export async function createInteractiveFromAuthoring(
  user: AuthUser,
  input: {
    courseId: string;
    title: string;
    description?: string | null;
    kind: Exclude<InteractiveKind, 'H5P_PACKAGE'>;
    body: InteractiveBody;
    sectionIds: string[];
    sourceOutlineItemId: string;
  },
) {
  return createInteractive(user, {
    ...input,
    isActive: false,
  });
}
