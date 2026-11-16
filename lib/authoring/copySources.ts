import { and, desc, eq } from 'drizzle-orm';

import { courseOfferings, courses } from '@/app/db/schema';
import { withCourseTenant } from '@/lib/authoring/tenant';
import { withTenant } from '@/lib/db/tenantContext';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { AuthUser } from '@/lib/getOrCreateUser';
import { getCourseWorkspaceId } from '@/lib/workspace';

export type OfferingCopySource = {
  offeringId: string;
  courseId: string;
  courseTitle: string;
  termLabel: string;
  status: string;
};

export async function getDefaultOfferingForCourse(
  courseId: string,
  userId?: string | null,
) {
  return withCourseTenant(courseId, userId ?? null, async (tx) =>
    tx.query.courseOfferings.findFirst({
      where: and(
        eq(courseOfferings.courseId, courseId),
        eq(courseOfferings.termLabel, 'default'),
      ),
    }),
  );
}

/** Offerings the professor may copy knowledge/outline from into the target course. */
export async function listCopySourceOfferings(
  user: AuthUser,
  targetCourseId: string,
): Promise<{
  targetOfferingId: string | null;
  sources: OfferingCopySource[];
}> {
  await assertCanManageCourse(user, targetCourseId);
  const workspaceId = await getCourseWorkspaceId(targetCourseId);
  const targetOffering = await getDefaultOfferingForCourse(
    targetCourseId,
    user.id,
  );

  if (!workspaceId) {
    return { targetOfferingId: targetOffering?.id ?? null, sources: [] };
  }

  const courseRows = await withTenant(workspaceId, user.id, async (tx) =>
    tx.query.courses.findMany({
      where: and(
        eq(courses.workspaceId, workspaceId),
        eq(courses.isActive, true),
      ),
      columns: { id: true, title: true },
    }),
  );

  const manageable: OfferingCopySource[] = [];
  for (const course of courseRows) {
    try {
      await assertCanManageCourse(user, course.id);
    } catch {
      continue;
    }
    const offerings = await withCourseTenant(course.id, user.id, async (tx) =>
      tx.query.courseOfferings.findMany({
        where: eq(courseOfferings.courseId, course.id),
        orderBy: [desc(courseOfferings.updatedAt)],
      }),
    );
    for (const off of offerings) {
      if (targetOffering && off.id === targetOffering.id) continue;
      if (course.id === targetCourseId && off.termLabel === 'default') continue;
      manageable.push({
        offeringId: off.id,
        courseId: course.id,
        courseTitle: course.title,
        termLabel: off.termLabel,
        status: off.status,
      });
    }
  }

  manageable.sort((a, b) =>
    `${a.courseTitle}:${a.termLabel}`.localeCompare(
      `${b.courseTitle}:${b.termLabel}`,
    ),
  );

  return { targetOfferingId: targetOffering?.id ?? null, sources: manageable };
}
