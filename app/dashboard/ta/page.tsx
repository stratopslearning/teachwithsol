import Link from 'next/link';
import { AlertTriangle } from '@/components/icons';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/patterns/EmptyState';
import { QuickRegradeButton } from '@/components/quiz/QuickRegradeButton';
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
import { appPath } from '@/lib/basePath';
import { requireTeachingAccess } from '@/lib/authz/gates';
import {
  isGrantOnlyTeachingAssistant,
  listGradeableSectionIdsFromGrants,
} from '@/lib/professor/graderSections';
import { getAttentionItemsForProfessor } from '@/lib/professorAttention';
import { appRedirect } from '@/lib/serverRedirect';
import { LocalDateTime } from '@/components/timezone/LocalDateTime';

export const dynamic = 'force-dynamic';

export default async function TaGradingDeskPage() {
  const user = await requireTeachingAccess();

  const grantSectionIds = await listGradeableSectionIdsFromGrants(user.id);
  if (grantSectionIds.length === 0) {
    appRedirect('/dashboard/professor');
  }

  const items = await getAttentionItemsForProfessor(user.id, {
    limit: 200,
    sectionIds: grantSectionIds.length > 0 ? grantSectionIds : undefined,
  });

  const grantOnly = await isGrantOnlyTeachingAssistant(user.id);

  return (
    <AppShell role="professor" active="attention" topbarTitle="TA grading">
      <PageHeader
        breadcrumbs={[{ label: 'TA desk' }]}
        eyebrow="Grading"
        title="Your grading queue"
        description={
          grantOnly
            ? 'Sections where you have TA or grader access. Publishing and rubric edits stay with the instructor.'
            : 'Filtered to sections where you hold TA or grader grants.'
        }
      />

      {items.length === 0 ? (
        <EmptyState
          className="mt-10"
          eyebrow="Clear"
          title="Nothing waiting"
          description="Submissions that need manual review will appear here for your assigned sections."
        />
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-rule">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Quiz</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Needs review</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.attemptId}>
                  <TableCell>
                    {[item.student.firstName, item.student.lastName]
                      .filter(Boolean)
                      .join(' ') || item.student.email}
                  </TableCell>
                  <TableCell>{item.quiz.title}</TableCell>
                  <TableCell>{item.section.name}</TableCell>
                  <TableCell>
                    <LocalDateTime value={item.submittedAt} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="warning">{item.needsAttentionCount}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <QuickRegradeButton attemptId={item.attemptId} />
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={appPath(
                            `/dashboard/professor/quiz/${item.quiz.id}/results/${item.attemptId}`,
                          )}
                        >
                          Open
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 text-xs text-ink-muted">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Publish, rubric edit, and course builder are hidden on this desk.
      </p>
    </AppShell>
  );
}
