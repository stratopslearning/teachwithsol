import { logAudit } from '@/lib/audit';
import { resolveAnalyticsSectionIds } from '@/lib/analytics/access';
import {
  getConceptMastery,
} from '@/lib/analytics/concepts';
import type { ConceptMasteryRow, TagCoverage } from '@/lib/analytics/aggregateConcepts';
import {
  getLessonCompletion,
  type LessonCompletionRow,
} from '@/lib/analytics/lessons';
import type { AuthUser } from '@/lib/getOrCreateUser';

export type { ConceptMasteryRow, TagCoverage, LessonCompletionRow };
export { aggregateConceptMastery } from '@/lib/analytics/aggregateConcepts';
export { CONCEPT_GAP_THRESHOLD } from '@/lib/analytics/constants';
export { getConceptMastery } from '@/lib/analytics/concepts';
export { getLessonCompletion } from '@/lib/analytics/lessons';
export {
  computeAllAnalyticsRollups,
  computeRollupsForCourse,
  type WhatToChangeSuggestion,
} from '@/lib/analytics/computeRollups';

export type CourseAnalytics = {
  courseId: string;
  courseTitle: string;
  sectionIds: string[];
  concepts: ConceptMasteryRow[];
  lessons: LessonCompletionRow[];
  tagCoverage: TagCoverage;
  gapCount: number;
  avgLessonCompletionRate: number;
  generatedAt: string;
};

export async function getCourseAnalytics(
  user: AuthUser,
  courseId: string,
  opts?: {
    sectionId?: string | null;
    audit?: boolean;
  },
): Promise<CourseAnalytics> {
  const { course, sectionIds } = await resolveAnalyticsSectionIds(
    user,
    courseId,
    opts?.sectionId,
  );

  const [{ concepts, tagCoverage }, lessons] = await Promise.all([
    getConceptMastery(user, courseId, { sectionId: opts?.sectionId }),
    getLessonCompletion(user, courseId, { sectionId: opts?.sectionId }),
  ]);

  const gapCount = concepts.filter((c) => c.gap).length;
  const avgLessonCompletionRate =
    lessons.length > 0
      ? Math.round(
          lessons.reduce((sum, l) => sum + l.completionRate, 0) /
            lessons.length,
        )
      : 0;

  if (opts?.audit !== false) {
    const { getCourseWorkspaceId } = await import('@/lib/workspace');
    const tenantId = await getCourseWorkspaceId(courseId);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'professor.analytics.view',
      targetType: 'course',
      targetId: courseId,
      tenantId,
      platform: !tenantId,
      metadata: {
        sectionId: opts?.sectionId ?? null,
        conceptCount: concepts.length,
        gapCount,
      },
    });
  }

  return {
    courseId: course.id,
    courseTitle: course.title,
    sectionIds,
    concepts,
    lessons,
    tagCoverage,
    gapCount,
    avgLessonCompletionRate,
    generatedAt: new Date().toISOString(),
  };
}
