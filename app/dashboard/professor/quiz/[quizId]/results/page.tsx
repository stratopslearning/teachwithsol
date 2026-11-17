import {
  CheckCircle,
  Eye,
  FileText,
  TrendingUp,
  Users,
  XCircle,
} from "@/components/icons";
import { notFound } from "next/navigation";

import { loadQuizResultsAssignment } from "@/lib/data/pages/professorQuizzes";
import ExportResultsWrapper from "@/components/ExportResultsWrapper";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { EmptyState } from "@/components/patterns/EmptyState";
import { StatCard } from "@/components/patterns/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTeachingAccess } from "@/lib/authz/gates";
import { formatPersonName } from "@/lib/personName";
import { withBasePath } from "@/lib/basePath";
import { fetchSubmittedAttemptsForProfessorSections } from "@/lib/professorVisibleAttempts";
import {
  accessibleQuizSectionIds,
  professorCanAccessQuiz,
} from "@/lib/quizAccess";
import { computeQuestionStatsForAttempts } from "@/lib/quizQuestionStats";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";
import { ReleaseBadge } from "@/components/status/badges";

export default async function QuizResultsPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const user = await requireTeachingAccess();

  if (!(await professorCanAccessQuiz(user, quizId))) notFound();

  const enrolledSectionIds = await accessibleQuizSectionIds(user, quizId);
  if (enrolledSectionIds.length === 0) notFound();

  const quizAssignment = await loadQuizResultsAssignment(quizId, enrolledSectionIds, user.id);

  if (!quizAssignment) notFound();
  const quiz = quizAssignment.quiz;
  if (!quiz) notFound();
  const visibleSectionAssignments = quiz.sectionAssignments.filter((assignment) =>
    enrolledSectionIds.includes(assignment.section.id),
  );
  const sectionSummary =
    visibleSectionAssignments.length > 0
      ? visibleSectionAssignments.map((sa) => sa.section.name).join(", ")
      : "your assigned sections";

  const quizAttempts = await fetchSubmittedAttemptsForProfessorSections({
    quizId,
    professorSectionIds: enrolledSectionIds,
    includePayloads: true,
  });

  const bestPerStudent: Record<string, number> = {};
  quizAttempts.forEach((a) => {
    const pct =
      a.percentage ??
      (a.maxScore ? Math.round(((a.score ?? 0) / a.maxScore) * 100) : 0);
    if (
      bestPerStudent[a.studentId] == null ||
      pct > bestPerStudent[a.studentId]
    ) {
      bestPerStudent[a.studentId] = pct;
    }
  });
  const bestPercentages = Object.values(bestPerStudent);

  const totalAttempts = quizAttempts.length;
  const uniqueStudents = new Set(quizAttempts.map((a) => a.studentId)).size;
  const averageScore =
    bestPercentages.length > 0
      ? Math.round(
          bestPercentages.reduce((sum, p) => sum + p, 0) /
            bestPercentages.length,
        )
      : 0;

  const questionStats = computeQuestionStatsForAttempts(
    quiz.questions,
    quizAttempts.map((a) => ({
      answers: 'answers' in a ? a.answers : undefined,
      gptFeedback: 'gptFeedback' in a ? a.gptFeedback : undefined,
    })),
  );

  return (
    <AppShell
      role="professor"
      active="assignments"
      topbarTitle={quiz.title}
      maxWidth="wide"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/professor") },
          {
            label: "Assignments",
            href: withBasePath("/dashboard/professor/assignments"),
          },
          { label: "Results" },
        ]}
        eyebrow="Results"
        title={quiz.title}
        description={`Aggregated results across ${sectionSummary}.`}
      />

      <section className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="paper paper-shadow p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <span className="eyebrow text-ink-faint">Snapshot</span>
              <h2 className="mt-2 font-display text-2xl text-ink">
                Performance at a glance.
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink-muted">
                Only submissions recorded under sections you teach are shown.
                The same quiz assigned elsewhere does not appear here.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <ReleaseBadge isActive={quiz.isActive} />
              {visibleSectionAssignments.map((assignment) => (
                <Badge key={assignment.section.id} variant="info">
                  {assignment.section.name}
                </Badge>
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Submissions"
              value={totalAttempts}
              icon={<FileText className="h-4 w-4" />}
            />
            <StatCard
              label="Learners"
              value={uniqueStudents}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="Average"
              value={`${averageScore}%`}
              icon={<TrendingUp className="h-4 w-4" />}
              accent
            />
            <StatCard
              label="Questions"
              value={quiz.questions.length}
              hint={`${quiz.maxAttempts} max attempts`}
            />
          </div>
        </div>

        <div className="xl:self-start">
          <ExportResultsWrapper quizzes={[{ id: quiz.id, title: quiz.title }]} />
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading eyebrow="Submissions" title="Per-attempt detail" />
        {quizAttempts.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              eyebrow="Empty"
              title="No attempts yet."
              description="Once learners submit, individual attempts will appear here."
            />
          </div>
        ) : (
          <div className="mt-6 paper paper-shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead className="tnum">Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quizAttempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">
                          {formatPersonName(attempt.student)}
                        </span>
                        <span className="text-xs text-ink-faint">
                          {attempt.student.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      {attempt.section?.name || "—"}
                      {attempt.section?.course?.title ? (
                        <span className="text-ink-faint">
                          {" · "}
                          {attempt.section.course.title}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tnum">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-lg text-ink">
                          {attempt.percentage}%
                        </span>
                        <span className="text-xs text-ink-faint">
                          {attempt.score}/{attempt.maxScore}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {attempt.passed ? (
                        <Badge variant="success">
                          <CheckCircle className="h-3 w-3" />
                          Passed
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3" />
                          Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted tnum">
                      <LocalDateTime value={attempt.submittedAt} dateOnly fallback="—" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={withBasePath(
                            `/dashboard/professor/attempt/${attempt.id}`,
                          )}
                          aria-label="View attempt"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-12">
        <SectionHeading
          eyebrow="Diagnostic"
          title="Question-by-question analysis"
        />
        {questionStats.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              eyebrow="Empty"
              title="No questions found."
            />
          </div>
        ) : (
          <div className="mt-6 paper paper-shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="tnum">Attempts</TableHead>
                  <TableHead className="tnum">Success</TableHead>
                  <TableHead className="tnum">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questionStats.map((question, index) => (
                  <TableRow key={question.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1 max-w-prose">
                        <span className="eyebrow text-ink-faint">
                          Q{index + 1}
                        </span>
                        <span className="text-ink line-clamp-2">
                          {question.question}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">
                        {question.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="tnum">{question.attempts}</TableCell>
                    <TableCell className="tnum">
                      <div className="flex flex-col">
                        <span className="font-display text-lg text-ink">
                          {question.successRate}%
                        </span>
                        <span className="text-xs text-ink-faint">
                          {question.correctAnswers}/{question.attempts}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tnum">{question.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
