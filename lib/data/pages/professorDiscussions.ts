import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { chatbotSessions, chatbots } from '@/app/db/schema';
import {
  fetchChatbotByIdDefiner,
  fetchChatbotSectionIdsDefiner,
} from '@/lib/db/studentReadDefiners';
import { withTenant } from '@/lib/db/tenantContext';
import { listTeachingSectionIds } from '@/lib/professor/graderSections';

// FORCE RLS: plain db reads return nothing. Each loader finds the bot's
// tenant via the SECURITY DEFINER lookup and reads under it.

/** A non-deleted discussion bot the user authored, with its section links. */
export async function loadOwnedDiscussionForEdit(id: string, userId: string) {
  const meta = await fetchChatbotByIdDefiner(id);
  if (!meta?.tenantId) return undefined;
  return withTenant(meta.tenantId, userId, (tx) =>
    tx.query.chatbots.findFirst({
      where: and(eq(chatbots.id, id), isNull(chatbots.deletedAt), eq(chatbots.professorId, userId)),
      with: { sectionAssignments: true },
    }),
  );
}

/**
 * A discussion bot the user authored and its completed sessions in sections
 * they teach. Returns null when the bot isn't theirs or doesn't exist.
 */
export async function loadDiscussionSessionsPage(id: string, user: { id: string }) {
  const meta = await fetchChatbotByIdDefiner(id);
  if (!meta?.tenantId) return null;
  const tenantId = meta.tenantId;
  const bot = await withTenant(tenantId, user.id, (tx) =>
    tx.query.chatbots.findFirst({
      where: and(eq(chatbots.id, id), isNull(chatbots.deletedAt), eq(chatbots.professorId, user.id)),
      with: { relatedQuiz: true },
    }),
  );
  if (!bot) return null;

  const taughtIds = await listTeachingSectionIds(user);
  const assigned = await fetchChatbotSectionIdsDefiner(id);
  const allowed = assigned.filter((sid) => taughtIds.includes(sid));

  const sessions =
    allowed.length > 0
      ? await withTenant(tenantId, user.id, (tx) =>
          tx.query.chatbotSessions.findMany({
            where: and(
              eq(chatbotSessions.chatbotId, id),
              eq(chatbotSessions.status, 'completed'),
              inArray(chatbotSessions.sectionId, allowed),
            ),
            with: { student: true, section: true },
            orderBy: [desc(chatbotSessions.completedAt)],
          }),
        )
      : [];
  return { bot, sessions };
}
