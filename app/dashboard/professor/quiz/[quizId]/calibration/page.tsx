import Link from 'next/link';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
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
import { db } from '@/app/db';
import { quizzes } from '@/app/db/schema';
import { activeOnly } from '@/lib/db/filters';
import { appPath, withBasePath } from '@/lib/basePath';
import { userCanWriteQuiz } from '@/lib/quizAccess';
import { getCalibrationStubForQuiz } from '@/lib/quiz/calibrationStub';
import { appRedirect } from '@/lib/serverRedirect';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function QuizCalibrationPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const user = await requireTeachingAccess();

  const { quizId } = await params;
  const quiz = await db.query.quizzes.findFirst({
    where: and(eq(quizzes.id, quizId), activeOnly(quizzes.deletedAt)),
    columns: { id: true, title: true, professorId: true },
  });
  if (!quiz) notFound();
  // professorId is metadata; access = content.write on a section the quiz is assigned to.
  if (!(await userCanWriteQuiz(user, quizId))) notFound();

  const summary = await getCalibrationStubForQuiz(quizId, 8);

  return (
    <AppShell role="professor" active="quizzes" topbarTitle="Calibration">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: withBasePath('/dashboard/professor') },
          {
            label: quiz.title,
            href: withBasePath(`/dashboard/professor/quiz/${quizId}/results`),
          },
          { label: 'Calibration' },
        ]}
        eyebrow="Grading quality"
        title="Calibration (stub)"
        description="Grade a small sample and compare auto-scores with instructor overrides. Full calibration workflows will expand here."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={appPath(`/dashboard/professor/quiz/${quizId}/edit`)}>
              Back to quiz
            </Link>
          </Button>
        }
      />

      <div className="mt-8 flex flex-wrap gap-3">
        <Badge variant="secondary">
          {summary.sampleSize} sample{summary.sampleSize === 1 ? '' : 's'}
        </Badge>
        <Badge
          variant={summary.disagreementCount > 0 ? 'destructive' : 'secondary'}
        >
          {summary.disagreementCount} disagreement
          {summary.disagreementCount === 1 ? '' : 's'}
        </Badge>
      </div>

      <section className="mt-10">
        <SectionHeading
          title="Recent attempts"
          description="Disagreement = at least one manual grade override on the attempt."
        />
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Auto %</TableHead>
                <TableHead>Override signal</TableHead>
                <TableHead>Disagrees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.samples.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No submitted attempts yet.
                  </TableCell>
                </TableRow>
              ) : (
                summary.samples.map((s) => (
                  <TableRow key={s.attemptId}>
                    <TableCell>{s.studentLabel}</TableCell>
                    <TableCell>{s.autoScore ?? '—'}</TableCell>
                    <TableCell>{s.disagrees ? 'Override present' : '—'}</TableCell>
                    <TableCell>{s.disagrees ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </AppShell>
  );
}
