import { and, eq, inArray, isNull, ne } from 'drizzle-orm';

import {
  courseActivities,
  courseKnowledgeLinks,
  courseOutlines,
  outlineItems,
  outlineModules,
  quizzes,
  sections,
} from '@/app/db/schema';
import { withCourseTenant } from '@/lib/authoring/tenant';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import type { AuthUser } from '@/lib/getOrCreateUser';

export type RolloverFinding = {
  code:
    | 'stale_dates'
    | 'missing_dates'
    | 'duplicate_titles'
    | 'unpublished_inactive'
    | 'outline_not_released'
    | 'missing_work_zeros'
    | 'knowledge_pending_updates'
    | 'knowledge_no_attachments';
  severity: 'warning' | 'info';
  title: string;
  detail: string;
  entityType?: string;
  entityId?: string;
};

export async function runRolloverChecks(
  user: AuthUser,
  courseId: string,
): Promise<{ findings: RolloverFinding[]; checkedAt: string }> {
  await assertCanManageCourse(user, courseId);
  const findings: RolloverFinding[] = [];
  const now = new Date();

  await withCourseTenant(courseId, user.id, async (tx) => {
    const courseSections = await tx.query.sections.findMany({
      where: and(eq(sections.courseId, courseId), isNull(sections.deletedAt)),
      columns: { id: true, name: true, endsAt: true, isActive: true },
    });

    const outline = await tx.query.courseOutlines.findFirst({
      where: and(
        eq(courseOutlines.courseId, courseId),
        isNull(courseOutlines.deletedAt),
        ne(courseOutlines.status, 'ARCHIVED'),
      ),
      orderBy: (t, { desc }) => [desc(t.updatedAt)],
    });

    if (outline) {
      const modules = await tx.query.outlineModules.findMany({
        where: and(
          eq(outlineModules.outlineId, outline.id),
          isNull(outlineModules.deletedAt),
        ),
        with: { items: { where: isNull(outlineItems.deletedAt) } },
      });
      const items = modules.flatMap((m) => m.items ?? []);

      const titleCounts = new Map<string, string[]>();
      for (const item of items) {
        const key = `${item.type}:${item.title.trim().toLowerCase()}`;
        const list = titleCounts.get(key) ?? [];
        list.push(item.id);
        titleCounts.set(key, list);
      }
      for (const [, ids] of titleCounts) {
        if (ids.length > 1) {
          findings.push({
            code: 'duplicate_titles',
            severity: 'warning',
            title: 'Duplicated outline items',
            detail: `${ids.length} items share the same type and title.`,
            entityType: 'outline_item',
            entityId: ids[0],
          });
        }
      }

      for (const item of items) {
        if (item.status === 'PUBLISHED' || item.publishedQuizId) {
          // Published but may be inactive — checked via quizzes below
        } else if (outline.bodiesBuilt && outline.status === 'READY') {
          findings.push({
            code: 'outline_not_released',
            severity: 'info',
            title: 'Draft item not published',
            detail: `“${item.title}” is still a draft. Publish inactive, then release when ready.`,
            entityType: 'outline_item',
            entityId: item.id,
          });
        }
      }
    }

    const activities = await tx.query.courseActivities.findMany({
      where: and(
        eq(courseActivities.courseId, courseId),
        isNull(courseActivities.deletedAt),
      ),
    });

    const quizIds = activities
      .map((a) => a.quizId)
      .filter((id): id is string => Boolean(id));

    const relevantQuizzes =
      quizIds.length > 0
        ? await tx.query.quizzes.findMany({
            where: and(inArray(quizzes.id, quizIds), isNull(quizzes.deletedAt)),
          })
        : [];

    for (const quiz of relevantQuizzes) {
      if (!quiz.startDate && !quiz.endDate) {
        findings.push({
          code: 'missing_dates',
          severity: 'warning',
          title: 'Quiz missing date window',
          detail: `“${quiz.title}” has no start or end date.`,
          entityType: 'quiz',
          entityId: quiz.id,
        });
      }
      if (quiz.endDate && quiz.endDate < now) {
        findings.push({
          code: 'stale_dates',
          severity: 'warning',
          title: 'Quiz end date in the past',
          detail: `“${quiz.title}” ended ${quiz.endDate.toISOString().slice(0, 10)}.`,
          entityType: 'quiz',
          entityId: quiz.id,
        });
      }
      for (const sec of courseSections) {
        if (sec.endsAt && quiz.endDate && quiz.endDate > sec.endsAt) {
          findings.push({
            code: 'stale_dates',
            severity: 'info',
            title: 'Quiz ends after section',
            detail: `“${quiz.title}” ends after section “${sec.name}”.`,
            entityType: 'quiz',
            entityId: quiz.id,
          });
        }
      }
      if (!quiz.isActive) {
        findings.push({
          code: 'unpublished_inactive',
          severity: 'warning',
          title: 'Inactive quiz',
          detail: `“${quiz.title}” is published but inactive — students cannot see it until release.`,
          entityType: 'quiz',
          entityId: quiz.id,
        });
      }
      if (quiz.isActive && quiz.endDate && quiz.endDate < now) {
        findings.push({
          code: 'missing_work_zeros',
          severity: 'warning',
          title: 'Closed quiz may zero missing work',
          detail: `“${quiz.title}” is past its end date while still active. Incomplete attempts may score as zeros.`,
          entityType: 'quiz',
          entityId: quiz.id,
        });
      }
    }

    const knowledgeLinks = await tx.query.courseKnowledgeLinks.findMany({
      where: eq(courseKnowledgeLinks.courseId, courseId),
    });
    if (knowledgeLinks.length === 0) {
      findings.push({
        code: 'knowledge_no_attachments',
        severity: 'info',
        title: 'No library attachments',
        detail:
          'This course has no shared-library attachments. Rollover will not copy Knowledge links until you attach sources.',
        entityType: 'course',
        entityId: courseId,
      });
    } else {
      const pending = knowledgeLinks.filter((l) => l.updateAvailableVersionId);
      if (pending.length > 0) {
        findings.push({
          code: 'knowledge_pending_updates',
          severity: 'warning',
          title: 'Knowledge updates waiting',
          detail: `${pending.length} attached document${pending.length === 1 ? '' : 's'} have a newer library version. Accept or keep the pinned version before rollover.`,
          entityType: 'course_knowledge_link',
          entityId: pending[0]!.id,
        });
      }
    }
  });

  const infos = findings.filter((f) => f.severity === 'info');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const trimmedInfos = infos.slice(0, 12);

  return {
    findings: [...warnings, ...trimmedInfos],
    checkedAt: now.toISOString(),
  };
}
