import { eq } from "drizzle-orm";

import { db } from "@/app/db";
import { attempts, questions } from "@/app/db/schema";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentRegradeRequestForm } from "@/components/quiz/StudentRegradeRequestForm";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/basePath";
import { appRedirect } from "@/lib/serverRedirect";
import {
  attemptNeedsBackgroundRetry,
  scheduleAttemptRetry,
} from "@/lib/backgroundRetry";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { listGradeOverrideHistoryForAttempt } from "@/lib/professor/overrides";
import { quizGradesAreReleased } from "@/lib/professor/gradesReleased";
import { getOpenRegradeRequestForAttempt } from "@/lib/regradeRequests";

interface ResultsPageProps {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}

export default async function ResultsPage({
  params,
  searchParams,
}: ResultsPageProps) {
  const p = await params;
  const sp = await searchParams;
  const attemptId = sp.attemptId;
  const user = await getOrCreateUser();
  if (!user) appRedirect("/login");

  if (!attemptId) {
    appRedirect("/dashboard/student");
  }

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { quiz: true },
  });

  if (!attempt || attempt.studentId !== user.id) {
    appRedirect("/dashboard/student");
  }

  const quiz = attempt.quiz;
  if (
    attempt.tenantId &&
    (attempt.gradingStatus !== "complete" ||
      attemptNeedsBackgroundRetry(attempt.gptFeedback))
  ) {
    scheduleAttemptRetry(attempt.id, attempt.tenantId);
  }

  const gradesReleased = quizGradesAreReleased(quiz);
  const overrideHistory = gradesReleased
    ? await listGradeOverrideHistoryForAttempt(attempt.id)
    : [];
  const openRegradeRequest = attempt.submittedAt
    ? await getOpenRegradeRequestForAttempt({
        attemptId: attempt.id,
        studentId: user.id,
      })
    : null;

  const quizQuestions =
    overrideHistory.length > 0
      ? await db.query.questions.findMany({
          where: eq(questions.quizId, p.quizId),
          columns: { id: true, order: true },
        })
      : [];
  const questionOrder = new Map(
    quizQuestions.map((q) => [q.id, q.order] as const),
  );

  const percentage =
    attempt.percentage ??
    (attempt.maxScore
      ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100)
      : 0);

  return (
    <AppShell
      role="student"
      active="assignments"
      topbarTitle={quiz.title}
      maxWidth="narrow"
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        paid: user.paid,
      }}
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/student") },
          {
            label: "Assignments",
            href: withBasePath("/dashboard/student/assignments"),
          },
          { label: "Submitted" },
        ]}
        eyebrow="Submitted"
        title="Quiz received."
        description={`Your response to ${quiz.title} has been recorded. A summary is below.`}
      />

      <section className="mt-12">
        <div className="paper paper-shadow p-8 md:p-10">
          <div className="flex flex-col items-center text-center gap-6">
            <span className="eyebrow text-ink-faint">Result</span>
            <div className="stat-numeral text-7xl text-ink leading-none">
              {percentage}
              <span className="text-4xl text-ink-muted">%</span>
            </div>
            <p className="text-ink-muted tnum">
              {attempt.score} of {attempt.maxScore} points
            </p>

            <div className="hairline w-full max-w-xs my-2" />

            <dl className="flex flex-col sm:flex-row gap-6 text-sm text-ink-muted">
              <div className="flex flex-col items-center gap-1">
                <dt className="eyebrow text-ink-faint">Submitted</dt>
                <dd className="tnum text-ink whitespace-normal">
                  {attempt.submittedAt ? (
                    <LocalDateTime stacked value={attempt.submittedAt} />
                  ) : (
                    "-"
                  )}
                </dd>
              </div>
              <div className="flex flex-col items-center gap-1">
                <dt className="eyebrow text-ink-faint">Status</dt>
                <dd className="text-ink">
                  {attempt.passed ? "Passed" : "Submitted"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {overrideHistory.length > 0 ? (
          <div className="mt-6 paper paper-shadow p-6 md:p-8">
            <span className="eyebrow text-ink-faint">Grade adjustments</span>
            <p className="text-sm text-ink-muted mt-2">
              Your instructor updated how this attempt was scored. Notes below
              are shown in the order they were recorded.
            </p>
            <ol className="mt-5 flex flex-col gap-4 list-none p-0 m-0">
              {overrideHistory.map((entry) => {
                const label =
                  entry.questionId == null
                    ? "Whole attempt"
                    : questionOrder.has(entry.questionId)
                      ? `Question ${questionOrder.get(entry.questionId)! + 1}`
                      : "Question";
                return (
                  <li
                    key={entry.id}
                    className="border border-border rounded-lg p-4 bg-card/30"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-ink">
                        {label}
                        {entry.numericScore != null ? (
                          <span className="text-ink-muted font-normal">
                            {" "}
                            · score set to {entry.numericScore}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-ink-faint tnum">
                        <LocalDateTime stacked value={entry.createdAt} />
                      </span>
                    </div>
                    <p className="text-sm text-ink mt-2">{entry.note}</p>
                    {entry.criteriaOverrides &&
                    Object.keys(entry.criteriaOverrides).length > 0 ? (
                      <p className="text-xs text-ink-muted mt-2">
                        Rubric criteria were adjusted for this question.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {attempt.submittedAt ? (
          <StudentRegradeRequestForm
            attemptId={attempt.id}
            existingOpenRequest={
              openRegradeRequest
                ? {
                    id: openRegradeRequest.id,
                    note: openRegradeRequest.note,
                    createdAt: openRegradeRequest.createdAt.toISOString(),
                  }
                : null
            }
          />
        ) : null}

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <a
              href={withBasePath(
                `/quiz/${p.quizId}/review?attemptId=${attemptId}`,
              )}
            >
              Review answers
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={withBasePath("/dashboard/student")}>
              Back to dashboard
            </a>
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
