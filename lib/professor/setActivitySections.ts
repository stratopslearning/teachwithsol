/**
 * Replace (or add) section links for course activities.
 * Callers must already have teaching access; this re-checks content.write.
 */
import { eq, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { interactiveSections } from '@/app/db/schema';
import type { ActivityType } from '@/lib/assignments/types';
import { ApiError } from '@/lib/api/errors';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import {
  assignChatbotSectionsDefiner,
  assignQuizSectionsDefiner,
  updateChatbotDefiner,
} from '@/lib/db/facultyWriteDefiners';
import { rowsFromExecute } from '@/lib/db/rows';
import type { AuthUser } from '@/lib/getOrCreateUser';
import { assignInteractiveSections } from '@/lib/interactives/mutations';
import { userCanWriteQuiz } from '@/lib/quiz/access';
import {
  getActiveChatbot,
  userCanWriteChatbot,
} from '@/lib/chatbot/access';


async function assertWriteOnSections(
  user: AuthUser,
  sectionIds: string[],
): Promise<void> {
  for (const id of sectionIds) {
    if (!(await authorizeOnSection(user, 'content.write', id))) {
      throw ApiError.forbidden(
        'You can only assign activities to sections you teach',
      );
    }
  }
}

async function setQuizSectionsReplace(
  user: AuthUser,
  quizId: string,
  sectionIds: string[],
): Promise<string[]> {
  if (!(await userCanWriteQuiz(user, quizId))) {
    throw ApiError.forbidden('You do not have write access to this quiz');
  }
  await assertWriteOnSections(user, sectionIds);
  const result = await db.execute(sql`
    SELECT sol_set_quiz_sections(${JSON.stringify({
      quizId,
      assignedBy: user.id,
      sectionIds,
    })}::jsonb) AS ids
  `);
  return rowsFromExecute<{ ids: string[] | null }>(result)[0]?.ids ?? [];
}

async function setDiscussionSectionsReplace(
  user: AuthUser,
  chatbotId: string,
  sectionIds: string[],
): Promise<string[]> {
  const bot = await getActiveChatbot(chatbotId);
  if (!bot || bot.isTemplate) {
    throw ApiError.badRequest('Duplicate the template before assigning');
  }
  if (!(await userCanWriteChatbot(user, bot))) {
    throw ApiError.forbidden('You do not have write access to this discussion');
  }
  await assertWriteOnSections(user, sectionIds);
  await updateChatbotDefiner({
    chatbotId,
    assignedBy: user.id,
    sectionIds,
  });
  return sectionIds;
}

/**
 * Replace the full section set for a quiz / discussion / interactive.
 */
export async function setActivitySections(
  user: AuthUser,
  opts: {
    type: ActivityType;
    entityId: string;
    sectionIds: string[];
  },
): Promise<{ sectionIds: string[] }> {
  const sectionIds = [...new Set(opts.sectionIds)];
  if (sectionIds.length > 0) {
    const { requireSectionTeaching } = await import('@/lib/workspace/entitlement');
    await requireSectionTeaching(sectionIds[0]!, user);
  }

  if (opts.type === 'QUIZ') {
    const ids = await setQuizSectionsReplace(user, opts.entityId, sectionIds);
    return { sectionIds: ids };
  }
  if (opts.type === 'DISCUSSION') {
    const ids = await setDiscussionSectionsReplace(
      user,
      opts.entityId,
      sectionIds,
    );
    return { sectionIds: ids };
  }
  if (opts.type === 'INTERACTIVE') {
    await assignInteractiveSections(user, opts.entityId, sectionIds);
    return { sectionIds };
  }
  throw ApiError.badRequest(
    'Lessons get their sections at publish time from Authoring',
  );
}

/**
 * Add one section onto an activity (section detail "Assign to this section").
 */
export async function addActivityToSection(
  user: AuthUser,
  opts: {
    type: ActivityType;
    entityId: string;
    sectionId: string;
  },
): Promise<void> {
  const { requireSectionTeaching } = await import('@/lib/workspace/entitlement');
  await requireSectionTeaching(opts.sectionId, user);
  await assertWriteOnSections(user, [opts.sectionId]);

  if (opts.type === 'QUIZ') {
    if (!(await userCanWriteQuiz(user, opts.entityId))) {
      throw ApiError.forbidden('You do not have write access to this quiz');
    }
    await assignQuizSectionsDefiner({
      quizId: opts.entityId,
      assignedBy: user.id,
      sectionIds: [opts.sectionId],
    });
    return;
  }
  if (opts.type === 'DISCUSSION') {
    const bot = await getActiveChatbot(opts.entityId);
    if (!bot || bot.isTemplate) {
      throw ApiError.badRequest('Duplicate the template before assigning');
    }
    if (!(await userCanWriteChatbot(user, bot))) {
      throw ApiError.forbidden(
        'You do not have write access to this discussion',
      );
    }
    await assignChatbotSectionsDefiner({
      chatbotId: opts.entityId,
      assignedBy: user.id,
      sectionIds: [opts.sectionId],
    });
    return;
  }
  if (opts.type === 'INTERACTIVE') {
    const { fetchInteractiveSectionIdsDefiner } = await import(
      '@/lib/db/facultyWriteDefiners'
    );
    const existing = await fetchInteractiveSectionIdsDefiner(opts.entityId);
    const next = [...new Set([...existing, opts.sectionId])];
    await assignInteractiveSections(user, opts.entityId, next);
    return;
  }
  throw ApiError.badRequest('Cannot assign this activity type here');
}

export { entityIdForActivity } from '@/lib/professor/activityEntity';
