import { eq } from 'drizzle-orm';

import { outlineItems } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { assertCanManageItem } from '@/lib/authoring/access';
import type { OutlineItemSummary } from '@/lib/authoring/outlines';
import { withItemTenant } from '@/lib/authoring/tenant';
import type { AuthUser } from '@/lib/getOrCreateUser';

export type ItemPreview = {
  item: OutlineItemSummary;
  mode: 'faculty' | 'student';
  preview: {
    type: 'LESSON' | 'QUIZ' | 'DISCUSSION' | 'INTERACTIVE';
    title: string;
    markdown?: string;
    description?: string;
    questions?: Array<{
      type: string;
      question: string;
      options?: string[];
      points: number;
      /** Faculty mode only — omitted for student preview. */
      correctAnswer?: string;
    }>;
    systemPrompt?: string;
    instructions?: string;
    personaName?: string;
    interactiveKind?: string;
    interactiveBody?: OutlineItemSummary['body']['interactiveBody'];
  };
};

function mapItemSummary(
  updated: typeof outlineItems.$inferSelect,
): OutlineItemSummary {
  return {
    id: updated.id,
    moduleId: updated.moduleId,
    type: updated.type as OutlineItemSummary['type'],
    title: updated.title,
    status: updated.status as OutlineItemSummary['status'],
    body: (updated.body ?? {}) as OutlineItemSummary['body'],
    sourceMaterialIds: (updated.sourceMaterialIds ?? []) as string[],
    variantOfItemId: updated.variantOfItemId ?? null,
    faithfulBody: (updated.faithfulBody ??
      null) as OutlineItemSummary['faithfulBody'],
    publishedQuizId: updated.publishedQuizId,
    publishedChatbotId: updated.publishedChatbotId,
    publishedLessonId: updated.publishedLessonId,
    publishedInteractiveId: updated.publishedInteractiveId,
    position: updated.position,
  };
}

/**
 * Faculty or student-as preview. Student mode strips answer keys and never
 * writes grades — outline item may move to PREVIEW status only.
 */
export async function previewOutlineItem(
  user: AuthUser,
  itemId: string,
  opts?: { mode?: 'faculty' | 'student' },
): Promise<ItemPreview> {
  const mode = opts?.mode ?? 'faculty';
  const { item } = await assertCanManageItem(user, itemId);
  const body = (item.body ?? {}) as OutlineItemSummary['body'];

  if (
    item.type === 'LESSON' &&
    !body.markdown?.trim() &&
    !(
      body.chapter?.kind === 'interactive_chapter' &&
      (body.chapter.sections?.length ?? 0) > 0
    )
  ) {
    throw ApiError.badRequest('Lesson has no content to preview');
  }
  if (item.type === 'QUIZ' && (!body.questions || body.questions.length === 0)) {
    throw ApiError.badRequest('Quiz has no questions to preview');
  }
  if (
    item.type === 'DISCUSSION' &&
    (!body.systemPrompt?.trim() || !body.instructions?.trim())
  ) {
    throw ApiError.badRequest('Discussion is incomplete');
  }
  if (
    item.type === 'INTERACTIVE' &&
    (!body.interactiveKind ||
      !body.interactiveBody ||
      Object.keys(body.interactiveBody).length === 0)
  ) {
    throw ApiError.badRequest('Interactive is incomplete');
  }

  const updated = await withItemTenant(itemId, user.id, async (tx) => {
    const [row] = await tx
      .update(outlineItems)
      .set({
        status: item.status === 'PUBLISHED' ? 'PUBLISHED' : 'PREVIEW',
        updatedAt: new Date(),
      })
      .where(eq(outlineItems.id, itemId))
      .returning();
    return row!;
  });

  const summary = mapItemSummary(updated);

  const studentInteractiveBody = body.interactiveBody
    ? stripInteractiveAnswers(body.interactiveBody)
    : undefined;

  return {
    item: summary,
    mode,
    preview: {
      type: summary.type,
      title: summary.title,
      markdown: body.markdown,
      description: body.description,
      questions: body.questions?.map((q) => ({
        type: q.type,
        question: q.question,
        options: q.options,
        points: q.points ?? 1,
        ...(mode === 'faculty' ? { correctAnswer: q.correctAnswer } : {}),
      })),
      // Students see discussion prompt instructions, not the hidden system prompt
      systemPrompt: mode === 'faculty' ? body.systemPrompt : undefined,
      instructions: body.instructions,
      personaName: body.personaName,
      interactiveKind: body.interactiveKind,
      interactiveBody:
        mode === 'faculty' ? body.interactiveBody : studentInteractiveBody,
    },
  };
}

function stripInteractiveAnswers(
  body: NonNullable<OutlineItemSummary['body']['interactiveBody']>,
): OutlineItemSummary['body']['interactiveBody'] {
  const next = { ...body };
  if (Array.isArray(next.blanks)) {
    next.blanks = next.blanks.map((b) => ({
      ...b,
      answers: [],
    }));
  }
  // Keep words/sentence for drag; answers aren't separate. Mask markers in text?
  if (typeof next.text === 'string') {
    next.text = next.text.replace(/\{\{[^}]+\}\}/g, '{{…}}');
  }
  return next;
}
