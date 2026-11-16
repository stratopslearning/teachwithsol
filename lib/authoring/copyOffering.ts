import { and, eq, isNull, ne } from 'drizzle-orm';

import {
  courseKnowledgeLinks,
  courseOfferings,
  chatbots,
  courseOutlines,
  outlineItems,
  outlineModules,
  questions,
  quizzes,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { runRolloverChecks } from '@/lib/authoring/rolloverChecks';
import {
  resolveCourseTenantId,
  withCourseTenant,
} from '@/lib/authoring/tenant';
import { withTenant } from '@/lib/db/tenantContext';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import { fetchOfferingCourseId } from '@/lib/workspace/workspaceScopedReads';
import type { AuthUser } from '@/lib/getOrCreateUser';

type OfferingRow = typeof courseOfferings.$inferSelect;

async function loadOfferingForCopy(
  offeringId: string,
  userId: string,
): Promise<OfferingRow | null> {
  const courseId = await fetchOfferingCourseId(offeringId);
  if (!courseId) return null;
  return withCourseTenant(courseId, userId, async (tx) => {
    const row = await tx.query.courseOfferings.findFirst({
      where: eq(courseOfferings.id, offeringId),
    });
    return row ?? null;
  });
}

export type CopyOfferingResult = {
  targetOfferingId: string;
  targetCourseId: string;
  sourceOfferingId: string;
  sourceCourseId: string;
  knowledgeLinksCopied: number;
  outlineCloned: boolean;
  quizzesCopied: number;
  chatbotsCopied: number;
  rolloverFindings: Awaited<ReturnType<typeof runRolloverChecks>>['findings'];
};

/**
 * Copy knowledge links (+ outline structure when present) from a prior offering
 * into the target offering's course. Best-effort clones quizzes (+ questions)
 * and chatbots as INACTIVE drafts (no section assignments, dates, or released
 * grades) so the new term starts from last term's content without going live.
 */
export async function copyOfferingFromSource(
  user: AuthUser,
  targetOfferingId: string,
  sourceOfferingId: string,
): Promise<CopyOfferingResult> {
  if (targetOfferingId === sourceOfferingId) {
    throw ApiError.badRequest('Source and target offering must differ');
  }

  const [target, source] = await Promise.all([
    loadOfferingForCopy(targetOfferingId, user.id),
    loadOfferingForCopy(sourceOfferingId, user.id),
  ]);
  if (!target || !source) {
    throw ApiError.notFound('Offering not found');
  }

  await assertCanManageCourse(user, target.courseId);
  await assertCanManageCourse(user, source.courseId);

  const targetTenantId =
    target.tenantId ?? (await resolveCourseTenantId(target.courseId));
  const sourceTenantId =
    source.tenantId ?? (await resolveCourseTenantId(source.courseId));

  const sourceLinks = await withCourseTenant(
    source.courseId,
    user.id,
    async (tx) =>
      tx.query.courseKnowledgeLinks.findMany({
        where: eq(courseKnowledgeLinks.courseId, source.courseId),
      }),
  );

  const knowledgeLinksCopied = await withCourseTenant(
    target.courseId,
    user.id,
    async (tx, tenantId) => {
      let copied = 0;
      for (const link of sourceLinks) {
        const existing = await tx.query.courseKnowledgeLinks.findFirst({
          where: and(
            eq(courseKnowledgeLinks.courseId, target.courseId),
            eq(courseKnowledgeLinks.documentId, link.documentId),
          ),
        });
        if (existing) continue;
        await tx.insert(courseKnowledgeLinks).values({
          courseId: target.courseId,
          documentId: link.documentId,
          tenantId: link.tenantId ?? tenantId,
          linkedByUserId: user.id,
          pinnedVersionId: link.pinnedVersionId,
          updateAvailableVersionId: link.updateAvailableVersionId,
          updateNoticedAt: link.updateNoticedAt,
          authoringCorpus: link.authoringCorpus,
        });
        copied += 1;
      }
      return copied;
    },
  );

  let outlineCloned = false;
  const sourceOutline = await withCourseTenant(
    source.courseId,
    user.id,
    async (tx) =>
      tx.query.courseOutlines.findFirst({
        where: and(
          eq(courseOutlines.courseId, source.courseId),
          isNull(courseOutlines.deletedAt),
          ne(courseOutlines.status, 'ARCHIVED'),
        ),
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      }),
  );

  if (sourceOutline) {
    const modules = await withCourseTenant(source.courseId, user.id, async (tx) =>
      tx.query.outlineModules.findMany({
        where: and(
          eq(outlineModules.outlineId, sourceOutline.id),
          isNull(outlineModules.deletedAt),
        ),
        with: {
          items: {
            where: isNull(outlineItems.deletedAt),
          },
        },
        orderBy: (t, { asc }) => [asc(t.position)],
      }),
    );

    outlineCloned = await withCourseTenant(
      target.courseId,
      user.id,
      async (tx, tenantId) => {
        const targetHasOutline = await tx.query.courseOutlines.findFirst({
          where: and(
            eq(courseOutlines.courseId, target.courseId),
            isNull(courseOutlines.deletedAt),
            ne(courseOutlines.status, 'ARCHIVED'),
          ),
        });
        if (targetHasOutline) return false;

        const [outline] = await tx
          .insert(courseOutlines)
          .values({
            courseId: target.courseId,
            tenantId,
            createdByUserId: user.id,
            title: sourceOutline.title,
            brief: sourceOutline.brief,
            status: 'DRAFT',
            hasPriorCorpus: true,
            bodiesBuilt: sourceOutline.bodiesBuilt,
          })
          .returning();

        for (const mod of modules) {
          const [moduleRow] = await tx
            .insert(outlineModules)
            .values({
              outlineId: outline!.id,
              tenantId,
              title: mod.title,
              summary: mod.summary,
              position: mod.position,
            })
            .returning();
          const items = mod.items ?? [];
          if (items.length > 0) {
            await tx.insert(outlineItems).values(
              items.map((item) => ({
                moduleId: moduleRow!.id,
                tenantId,
                type: item.type,
                title: item.title,
                status: 'DRAFT' as const,
                body: item.body ?? {},
                sourceMaterialIds: item.sourceMaterialIds ?? [],
                faithfulBody: item.faithfulBody,
                position: item.position,
              })),
            );
          }
        }
        return true;
      },
    );
  }

  const { quizzesCopied, chatbotsCopied } = await cloneOfferingAssets(
    user,
    source,
    target,
    sourceTenantId,
    targetTenantId,
  );

  const { findings } = await runRolloverChecks(user, target.courseId);

  return {
    targetOfferingId,
    targetCourseId: target.courseId,
    sourceOfferingId,
    sourceCourseId: source.courseId,
    knowledgeLinksCopied,
    outlineCloned,
    quizzesCopied,
    chatbotsCopied,
    rolloverFindings: findings,
  };
}

/** Best-effort, idempotent (by title) clone of quizzes + chatbots. Never throws. */
async function cloneOfferingAssets(
  user: AuthUser,
  source: OfferingRow,
  target: OfferingRow,
  sourceTenantId: string,
  targetTenantId: string,
): Promise<{ quizzesCopied: number; chatbotsCopied: number }> {
  let quizzesCopied = 0;
  let chatbotsCopied = 0;

  try {
    const srcQuizzes = await withTenant(sourceTenantId, user.id, (tx) =>
      tx.query.quizzes.findMany({
        where: and(eq(quizzes.offeringId, source.id), isNull(quizzes.deletedAt)),
      }),
    );
    const tgtQuizzes = await withTenant(targetTenantId, user.id, (tx) =>
      tx.query.quizzes.findMany({
        where: and(eq(quizzes.offeringId, target.id), isNull(quizzes.deletedAt)),
        columns: { title: true },
      }),
    );
    const have = new Set(tgtQuizzes.map((q) => q.title));
    for (const q of srcQuizzes) {
      if (have.has(q.title)) continue;
      try {
        const qs = await withTenant(sourceTenantId, user.id, (tx) =>
          tx.query.questions.findMany({
            where: eq(questions.quizId, q.id),
          }),
        );
        await withTenant(targetTenantId, user.id, async (tx) => {
          const [copy] = await tx
            .insert(quizzes)
            .values({
              title: q.title,
              description: q.description,
              professorId: user.id,
              tenantId: targetTenantId,
              offeringId: target.id,
              maxAttempts: q.maxAttempts,
              timeLimit: q.timeLimit,
              passingScore: q.passingScore,
              isActive: false,
            })
            .returning({ id: quizzes.id });
          if (qs.length > 0) {
            await tx.insert(questions).values(
              qs.map((x) => ({
                quizId: copy!.id,
                tenantId: targetTenantId,
                offeringId: target.id,
                type: x.type,
                question: x.question,
                options: x.options,
                correctAnswer: x.correctAnswer,
                points: x.points,
                order: x.order,
                rubric: x.rubric,
                rubricVersion: x.rubricVersion,
                conceptTags: x.conceptTags,
              })),
            );
          }
        });
        quizzesCopied += 1;
      } catch (err) {
        console.error('[copyOffering] quiz clone failed', q.id, err);
      }
    }
  } catch (err) {
    console.error('[copyOffering] quiz clone skipped', err);
  }

  try {
    const srcBots = await withTenant(sourceTenantId, user.id, (tx) =>
      tx.query.chatbots.findMany({
        where: and(
          eq(chatbots.offeringId, source.id),
          eq(chatbots.isTemplate, false),
          isNull(chatbots.deletedAt),
        ),
      }),
    );
    const tgtBots = await withTenant(targetTenantId, user.id, (tx) =>
      tx.query.chatbots.findMany({
        where: and(
          eq(chatbots.offeringId, target.id),
          isNull(chatbots.deletedAt),
        ),
        columns: { title: true },
      }),
    );
    const have = new Set(tgtBots.map((b) => b.title));
    for (const b of srcBots) {
      if (have.has(b.title)) continue;
      try {
        await withTenant(targetTenantId, user.id, async (tx) => {
          await tx.insert(chatbots).values({
            professorId: user.id,
            tenantId: targetTenantId,
            offeringId: target.id,
            title: b.title,
            description: b.description,
            personaName: b.personaName,
            instructions: b.instructions,
            systemPrompt: b.systemPrompt,
            isTemplate: false,
            model: b.model,
            aiPolicy: b.aiPolicy,
            isActive: false,
            // relatedQuizId intentionally dropped: points at last term's quiz.
          });
        });
        chatbotsCopied += 1;
      } catch (err) {
        console.error('[copyOffering] chatbot clone failed', b.id, err);
      }
    }
  } catch (err) {
    console.error('[copyOffering] chatbot clone skipped', err);
  }

  return { quizzesCopied, chatbotsCopied };
}
