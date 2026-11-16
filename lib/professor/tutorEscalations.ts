import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';

import { groupSectionIdsByTenant } from '@/lib/db/sectionTenants';
import { withTenant } from '@/lib/db/tenantContext';

type TenantTx = Parameters<Parameters<typeof withTenant>[2]>[0];
import { chatbotSessions, professorSections } from '@/app/db/schema';

export type TutorEscalationItem = {
  sessionId: string;
  chatbotId: string;
  chatbotTitle: string;
  sectionId: string;
  sectionName: string;
  courseTitle: string | null;
  student: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  escalatedAt: string | null;
  preview: string | null;
};

function sessionIsEscalated(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  if (meta.escalated === true) return true;
  if (meta.instructorEscalationRequested === true) return true;
  return false;
}

function escalatedAtFromMeta(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const at = meta.instructorEscalationAt ?? meta.escalatedAt;
  return typeof at === 'string' ? at : null;
}

export async function listTutorEscalationsForProfessor(
  professorId: string,
  options: { limit?: number } = {},
): Promise<TutorEscalationItem[]> {
  const { listTeachingSectionIds } = await import(
    '@/lib/professor/graderSections'
  );
  const sectionIds = await listTeachingSectionIds({ id: professorId });
  if (sectionIds.length === 0) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 100, 300));

  // FORCE RLS: a plain db read returns no sessions. Read each tenant's
  // sections under that tenant, then merge newest-first.
  const byTenant = await groupSectionIdsByTenant(sectionIds);
  const perTenant = await Promise.all(
    [...byTenant].map(([tenantId, ids]) =>
      withTenant(tenantId, professorId, (tx) => readEscalations(tx, ids)),
    ),
  );
  const rows = perTenant
    .flat()
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);

  function readEscalations(tx: TenantTx, ids: string[]) {
  return tx.query.chatbotSessions.findMany({
    where: and(
      inArray(chatbotSessions.sectionId, ids),
      or(
        sql`${chatbotSessions.sessionMetadata}->>'escalated' = 'true'`,
        sql`${chatbotSessions.sessionMetadata}->>'instructorEscalationRequested' = 'true'`,
      ),
    ),
    with: {
      student: true,
      chatbot: { columns: { id: true, title: true } },
      section: { with: { course: { columns: { title: true } } } },
    },
    orderBy: (t, { desc }) => [desc(t.startedAt)],
    limit,
  });
  }

  return rows
    .filter((row) =>
      sessionIsEscalated(row.sessionMetadata as Record<string, unknown>),
    )
    .map((row) => {
      const messages = row.messages ?? [];
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      return {
        sessionId: row.id,
        chatbotId: row.chatbotId,
        chatbotTitle: row.chatbot?.title ?? 'Discussion',
        sectionId: row.sectionId,
        sectionName: row.section.name,
        courseTitle: row.section.course?.title ?? null,
        student: {
          id: row.student.id,
          firstName: row.student.firstName,
          lastName: row.student.lastName,
          email: row.student.email,
        },
        escalatedAt: escalatedAtFromMeta(
          row.sessionMetadata as Record<string, unknown>,
        ),
        preview: lastUser?.content?.slice(0, 240) ?? null,
      };
    });
}
