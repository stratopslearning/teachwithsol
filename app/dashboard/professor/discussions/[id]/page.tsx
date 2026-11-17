import Link from 'next/link';
import { requireTeachingAccess } from '@/lib/authz/gates';

import { loadDiscussionSessionsPage } from '@/lib/data/pages/professorDiscussions';
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
  const data = await loadDiscussionSessionsPage(id, user);
  if (!data) appRedirect('/dashboard/professor/discussions');
  const { bot, sessions } = data;

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
