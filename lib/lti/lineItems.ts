import { and, eq } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  courseActivities,
  ltiLineItems,
  ltiSectionLinks,
  quizSections,
  quizzes,
} from '@/app/db/schema';
import { getLtiConfig } from '@/lib/lti/config';
import { createOrFindLineItem } from '@/lib/lti/ags';
import {
  ensurePlatformFromEnv,
  resolveLtiWorkspaceId,
} from '@/lib/lti/platform';

export type ActivityEntityRef =
  | { quizId: string }
  | { lessonId: string }
  | { chatbotId: string }
  | { interactiveId: string };

function resourceIdFor(ref: ActivityEntityRef): string {
  if ('quizId' in ref) return `sol:quiz:${ref.quizId}`;
  if ('lessonId' in ref) return `sol:lesson:${ref.lessonId}`;
  if ('chatbotId' in ref) return `sol:discussion:${ref.chatbotId}`;
  return `sol:interactive:${ref.interactiveId}`;
}

async function findActivity(ref: ActivityEntityRef) {
  if ('quizId' in ref) {
    return db.query.courseActivities.findFirst({
      where: eq(courseActivities.quizId, ref.quizId),
    });
  }
  if ('lessonId' in ref) {
    return db.query.courseActivities.findFirst({
      where: eq(courseActivities.lessonId, ref.lessonId),
    });
  }
  if ('chatbotId' in ref) {
    return db.query.courseActivities.findFirst({
      where: eq(courseActivities.chatbotId, ref.chatbotId),
    });
  }
  return db.query.courseActivities.findFirst({
    where: eq(courseActivities.interactiveId, ref.interactiveId),
  });
}

async function activityLabel(ref: ActivityEntityRef): Promise<{
  title: string;
  scoreMaximum: number;
}> {
  const activity = await findActivity(ref);
  if (activity) {
    return {
      title: activity.title,
      scoreMaximum: 'quizId' in ref ? 100 : 100,
    };
  }
  if ('quizId' in ref) {
    const quiz = await db.query.quizzes.findFirst({
      where: eq(quizzes.id, ref.quizId),
    });
    return { title: quiz?.title ?? 'SOL Quiz', scoreMaximum: 100 };
  }
  return { title: 'SOL Activity', scoreMaximum: 100 };
}

/**
 * Ensure an AGS line item exists for an activity on every linked section
 * where the activity is assigned (quizzes) or the section shares the course.
 */
export async function ensureLineItemsForActivity(
  ref: ActivityEntityRef,
): Promise<number> {
  const cfg = getLtiConfig();
  if (!cfg.enabled) return 0;

  const links = await db.query.ltiSectionLinks.findMany();
  if (links.length === 0) return 0;

  let created = 0;
  const { title: label, scoreMaximum } = await activityLabel(ref);
  const resourceId = resourceIdFor(ref);
  const activity = await findActivity(ref);

  for (const link of links) {
    if (!link.agsLineItemsUrl) continue;

    if ('quizId' in ref) {
      const assigned = await db.query.quizSections.findFirst({
        where: and(
          eq(quizSections.quizId, ref.quizId),
          eq(quizSections.sectionId, link.sectionId),
        ),
      });
      if (!assigned) continue;
    }

    const existing = await db.query.ltiLineItems.findFirst({
      where: and(
        eq(ltiLineItems.sectionLinkId, link.id),
        eq(ltiLineItems.resourceId, resourceId),
      ),
    });
    if (existing?.lineItemUrl) continue;

    try {
      await ensurePlatformFromEnv(await resolveLtiWorkspaceId());
      const agsItem = await createOrFindLineItem(cfg, link.agsLineItemsUrl, {
        label,
        resourceId,
        scoreMaximum,
      });

      const values = {
        sectionLinkId: link.id,
        tenantId: link.tenantId,
        courseActivityId: activity?.id ?? null,
        quizId: 'quizId' in ref ? ref.quizId : null,
        lessonId: 'lessonId' in ref ? ref.lessonId : null,
        chatbotId: 'chatbotId' in ref ? ref.chatbotId : null,
        interactiveId: 'interactiveId' in ref ? ref.interactiveId : null,
        resourceId,
        lineItemId: agsItem.id,
        lineItemUrl: agsItem.id,
        scoreMaximum: agsItem.scoreMaximum || scoreMaximum,
        label: agsItem.label || label,
        updatedAt: new Date(),
      };

      if (existing) {
        await db
          .update(ltiLineItems)
          .set(values)
          .where(eq(ltiLineItems.id, existing.id));
      } else {
        await db.insert(ltiLineItems).values(values);
      }
      created += 1;
    } catch (err) {
      console.error(
        'LTI line item ensure failed',
        resourceId,
        link.sectionId,
        err,
      );
    }
  }

  return created;
}

/** When a quiz (or other activity) is released/activated. */
export async function onActivityReleased(
  ref: ActivityEntityRef,
): Promise<void> {
  try {
    await ensureLineItemsForActivity(ref);
  } catch (err) {
    console.error('onActivityReleased LTI hook failed', ref, err);
  }
}

export async function findLineItemForQuizSection(
  quizId: string,
  sectionId: string,
) {
  const link = await db.query.ltiSectionLinks.findFirst({
    where: eq(ltiSectionLinks.sectionId, sectionId),
  });
  if (!link) return null;
  return db.query.ltiLineItems.findFirst({
    where: and(
      eq(ltiLineItems.sectionLinkId, link.id),
      eq(ltiLineItems.quizId, quizId),
    ),
  });
}

export async function findLineItemForEntitySection(
  ref: ActivityEntityRef,
  sectionId: string,
) {
  const link = await db.query.ltiSectionLinks.findFirst({
    where: eq(ltiSectionLinks.sectionId, sectionId),
  });
  if (!link) return null;
  const resourceId = resourceIdFor(ref);
  return db.query.ltiLineItems.findFirst({
    where: and(
      eq(ltiLineItems.sectionLinkId, link.id),
      eq(ltiLineItems.resourceId, resourceId),
    ),
  });
}
