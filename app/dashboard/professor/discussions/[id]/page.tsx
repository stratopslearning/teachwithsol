import Link from 'next/link';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import {
  fetchChatbotByIdDefiner,
  fetchChatbotSectionIdsDefiner,
} from '@/lib/db/studentReadDefiners';
import { withTenant } from '@/lib/db/tenantContext';
import {
  chatbotSessions,
  chatbots,
  professorSections,
} from '@/app/db/schema';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { appPath, withBasePath } from '@/lib/basePath';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { appRedirect } from '@/lib/serverRedirect';
import {
  LocalDateTime,
  TIMESTAMP_CELL_CLASS,
} from '@/components/timezone/LocalDateTime';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DiscussionSessionsPage(props: PageProps) {
  const user = await requireTeachingAccess();

  const { id } = await props.params;
  // FORCE RLS: plain db reads return nothing (this page always redirected
  // away). Find the bot's tenant via the definer and read under it.
  const meta = await fetchChatbotByIdDefiner(id);
  if (!meta?.tenantId) appRedirect('/dashboard/professor/discussions');
  const tenantId = meta.tenantId;
  const bot = await withTenant(tenantId, user.id, (tx) =>
    tx.query.chatbots.findFirst({
      where: and(
        eq(chatbots.id, id),
        isNull(chatbots.deletedAt),
        eq(chatbots.professorId, user.id),
      ),
      with: { relatedQuiz: true },
    }),
  );
  if (!bot) appRedirect('/dashboard/professor/discussions');

  const { listTeachingSectionIds } = await import(
    '@/lib/professor/graderSections'
  );
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

  return (
    <AppShell
      role="professor"
      active="assignments"
      topbarTitle="Discussion sessions"
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: withBasePath('/dashboard/professor') },
          {
            label: 'Assignments',
            href: withBasePath('/dashboard/professor/assignments'),
          },
          { label: bot.title },
        ]}
        eyebrow="Sessions"
        title={bot.title}
        description="Completed student transcripts for this discussion."
        actions={
          <Button asChild variant="outline">
            <Link
              href={appPath(`/dashboard/professor/discussions/${bot.id}/edit`)}
            >
              Edit
            </Link>
          </Button>
        }
      />

      {bot.relatedQuiz ? (
        <Badge variant="outline" className="mt-4">
          Learning mode · {bot.relatedQuiz.title}
        </Badge>
      ) : null}

      <div className="mt-8 paper paper-shadow overflow-hidden">
        {sessions.length === 0 ? (
          <p className="p-6 text-ink-muted">No completed sessions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Section</TableHead>
                <TableHead className="min-w-[13rem]">Completed</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {[s.student.firstName, s.student.lastName]
                      .filter(Boolean)
                      .join(' ') || s.student.email}
                  </TableCell>
                  <TableCell>{s.section.name}</TableCell>
                  <TableCell className={TIMESTAMP_CELL_CLASS}>
                    {s.completedAt
                      ? <LocalDateTime stacked value={s.completedAt} />
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {Array.isArray(s.messages) ? s.messages.length : 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={appPath(
                          `/dashboard/professor/discussions/session/${s.id}`,
                        )}
                      >
                        Review
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
