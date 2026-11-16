import { asc, eq } from "drizzle-orm";
import { requireTeachingAccess } from '@/lib/authz/gates';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { notFound } from "next/navigation";

import { withTenant } from "@/lib/db/tenantContext";
import { loadAttemptForGrading } from "@/lib/quiz/gradingData";
import {
  attempts,
  gradeOverrides,
  questions,
} from "@/app/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/layout/SectionHeading";
import {
  AttemptGradeOverridePanel,
  type OverrideHistoryEntry,
  type OverrideTargetQuestion,
} from "@/components/professor/AttemptGradeOverridePanel";
import { AttemptGradebookStatusBadge } from "@/components/professor/AttemptGradebookStatusBadge";
import { GPTFeedbackDisplay } from "@/components/quiz/GPTFeedbackDisplay";
import { RegradeAttemptButton } from "@/components/quiz/RegradeAttemptButton";
import { Badge } from "@/components/ui/badge";
import { withBasePath } from "@/lib/basePath";
import { formatPersonName } from "@/lib/personName";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import {
  buildLegacyQuestionKeyMap,
  resolveAttemptAnswer,
  resolveAttemptFeedback,
} from "@/lib/quizAttemptAnswers";
import { deriveAttemptGradebookStatus } from "@/lib/professor/attemptGradeStatus";
import { quizGradesAreReleased } from "@/lib/professor/gradesReleased";
import { isFallbackGradingFeedback, isPendingFeedback } from "@/lib/regradeAttempt";
import {
  isPendingStatus,
  type RubricCriterion,
  type StoredFeedback,
} from "@/lib/gradingTypes";
import {
  attemptNeedsBackgroundRetry,
  scheduleAttemptRetry,
} from "@/lib/backgroundRetry";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";

export default async function AttemptDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const user = await requireTeachingAccess();

  // FORCE RLS: plain db reads find no attempt (the page was always a 404).
  // Find the attempt's section and tenant via the definer, check access,
  // then read the rest under the tenant.
  const found = await loadAttemptForGrading(attemptId);
  if (!found?.tenantId) notFound();
  const tenantId = found.tenantId;

  // Binding-based: grade.write or content.read on the attempt's section.
  if (
    !(await authorizeOnSection(user, 'grade.write', found.sectionId)) &&
    !(await authorizeOnSection(user, 'content.read', found.sectionId))
  ) {
    notFound();
  }

  const { attempt, overrideRows } = await withTenant(tenantId, user.id, async (tx) => ({
    attempt: await tx.query.attempts.findFirst({
      where: eq(attempts.id, attemptId),
      with: {
        student: true,
        quiz: { with: { questions: { orderBy: questions.order } } },
        section: { with: { course: true } },
      },
    }),
    overrideRows: await tx.query.gradeOverrides.findMany({
      where: eq(gradeOverrides.attemptId, attemptId),
      orderBy: asc(gradeOverrides.createdAt),
      with: {
        actor: {
          columns: { firstName: true, lastName: true, email: true },
        },
      },
    }),
  }));
  if (!attempt) notFound();

  const studentAnswers =
    attempt.answers && typeof attempt.answers === "string"
      ? JSON.parse(attempt.answers)
      : (attempt.answers as Record<string, unknown>) || {};
  const gptFeedback: Record<string, any> = attempt.gptFeedback || {};
  const questionKeyMap = buildLegacyQuestionKeyMap(
    attempt.quiz.questions.map((question) => ({
      id: question.id,
      order: question.order,
      question: question.question,
      correctAnswer: question.correctAnswer,
    })),
    studentAnswers,
    gptFeedback,
  );

  const percentage =
    attempt.percentage ??
    (attempt.maxScore
      ? Math.round(((attempt.score ?? 0) / attempt.maxScore) * 100)
      : 0);

  const fallbackQuestionCount = attempt.quiz.questions.reduce((count, question) => {
    if (question.type !== "SHORT_ANSWER") {
      return count;
    }

    const questionFeedback = resolveAttemptFeedback(
      question.id,
      gptFeedback,
      questionKeyMap,
    );

    return isFallbackGradingFeedback(questionFeedback) ? count + 1 : count;
  }, 0);

  const pendingQuestionCount = attempt.quiz.questions.reduce((count, question) => {
    if (question.type !== "SHORT_ANSWER") return count;
    const questionFeedback = resolveAttemptFeedback(
      question.id,
      gptFeedback,
      questionKeyMap,
    );
    return isPendingFeedback(questionFeedback) ? count + 1 : count;
  }, 0);

  // Self-heal: nudge the worker every time a professor opens an attempt
  // that still has pending/manual_review entries. On Hobby we can't run a
  // per-minute cron, so we lean on real user activity to drive retries.
  if (attempt.tenantId && attemptNeedsBackgroundRetry(gptFeedback)) {
    scheduleAttemptRetry(attempt.id, attempt.tenantId);
  }

  const gradesReleased = quizGradesAreReleased(attempt.quiz);
  const gradebookStatus = deriveAttemptGradebookStatus({
    gradingStatus: attempt.gradingStatus,
    gptFeedback,
    hasGradeOverride: overrideRows.length > 0,
    gradesReleased,
  });

  const overrideQuestions: OverrideTargetQuestion[] = attempt.quiz.questions.map(
    (question) => {
      const feedback = resolveAttemptFeedback(
        question.id,
        gptFeedback,
        questionKeyMap,
      ) as StoredFeedback | undefined;
      const rubric =
        (question.rubric as RubricCriterion[] | null) ??
        feedback?.rubric ??
        [];
      const criteriaState: Record<string, boolean> = {};
      for (const criterion of rubric) {
        const match = feedback?.rubricMatches?.find(
          (m) => m.criterionId === criterion.id,
        );
        criteriaState[criterion.id] = match?.matched ?? false;
      }
      return {
        id: question.id,
        order: question.order,
        label: question.question,
        points: question.points,
        type: question.type,
        rubric,
        criteriaState,
      };
    },
  );

  const overrideHistory: OverrideHistoryEntry[] = overrideRows.map((row) => {
    const actor = row.actor;
    const actorLabel =
      [actor.firstName, actor.lastName].filter(Boolean).join(" ") ||
      actor.email ||
      "Instructor";
    return {
      id: row.id,
      questionId: row.questionId,
      numericScore: row.numericScore,
      criteriaOverrides: row.criteriaOverrides ?? null,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      actorLabel,
    };
  });

  return (
    <AppShell
      role="professor"
      active="quizzes"
      topbarTitle="Submission detail"
      maxWidth="wide"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/professor") },
          {
            label: "All results",
            href: withBasePath("/dashboard/professor/quiz-results"),
          },
          {
            label: attempt.quiz.title,
            href: withBasePath(
              `/dashboard/professor/quiz/${attempt.quiz.id}/results`,
            ),
          },
          { label: "Submission" },
        ]}
        eyebrow="Submission"
        title={formatPersonName(attempt.student)}
        description={`${attempt.quiz.title} · ${attempt.section.name} · ${attempt.section.course.title}`}
        actions={
          attempt.submittedAt ? (
            <RegradeAttemptButton
              attemptId={attempt.id}
              fallbackQuestionCount={fallbackQuestionCount}
              pendingQuestionCount={pendingQuestionCount}
              gradingStatus={attempt.gradingStatus}
            />
          ) : null
        }
      />

      <section className="mt-12">
        <SectionHeading eyebrow="Identity" title="Submission metadata" />
        <dl className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-6 paper paper-shadow p-6">
          <div>
            <dt className="eyebrow text-ink-faint">Learner</dt>
            <dd className="mt-2 text-ink">
              {formatPersonName(attempt.student)}
            </dd>
            <dd className="text-xs text-ink-faint">
              {attempt.student.email}
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-ink-faint">Section</dt>
            <dd className="mt-2 text-ink">{attempt.section.name}</dd>
            <dd className="text-xs text-ink-faint">
              {attempt.section.course.title}
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-ink-faint">Score</dt>
            <dd className="mt-2 stat-numeral text-2xl text-ink">
              {percentage}%
            </dd>
            <dd className="text-xs text-ink-faint tnum">
              {attempt.score}/{attempt.maxScore}
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-ink-faint">Submitted</dt>
            <dd className="mt-2 text-ink tnum">
              <LocalDateTime value={attempt.submittedAt} />
            </dd>
          </div>
          <div className="col-span-2 lg:col-span-4">
            <dt className="eyebrow text-ink-faint">Gradebook status</dt>
            <dd className="mt-2">
              <AttemptGradebookStatusBadge status={gradebookStatus} />
            </dd>
          </div>
        </dl>
      </section>

      {attempt.submittedAt ? (
        <section className="mt-12">
          <SectionHeading
            eyebrow="Instructor"
            title="Score override"
            description="Adjust numeric scores or rubric criteria. Original AI evidence stays on each question below."
          />
          <div className="mt-6 paper paper-shadow p-6 lg:p-8">
            <AttemptGradeOverridePanel
              attemptId={attempt.id}
              maxScore={attempt.maxScore ?? 0}
              questions={overrideQuestions}
              history={overrideHistory}
              canOverride={Boolean(attempt.submittedAt)}
            />
          </div>
        </section>
      ) : null}

      <section className="mt-16">
        <SectionHeading
          eyebrow="Responses"
          title="Question-by-question review"
        />
        <div className="mt-6 flex flex-col gap-4">
          {attempt.quiz.questions.map((question, index) => {
            const answerValue = resolveAttemptAnswer(
              question.id,
              studentAnswers as Record<string, unknown>,
              questionKeyMap,
            );
            let isCorrect = false;
            const questionFeedback = resolveAttemptFeedback(
              question.id,
              gptFeedback,
              questionKeyMap,
            );
            const isPending =
              question.type === "SHORT_ANSWER" &&
              isPendingStatus(questionFeedback?.status);
            if (question.type === "SHORT_ANSWER") {
              isCorrect = questionFeedback?.score === question.points;
            } else {
              isCorrect = answerValue === question.correctAnswer;
            }

            const noAnswer =
              answerValue === undefined ||
              answerValue === null ||
              answerValue === "";

            return (
              <article
                key={question.id}
                className="paper paper-shadow p-6 flex flex-col gap-4"
              >
                <header className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="eyebrow text-ink-faint">
                      Question {index + 1}
                    </span>
                    <h3 className="font-display text-lg text-ink leading-snug">
                      {question.question}
                    </h3>
                    {Array.isArray(question.conceptTags) &&
                    question.conceptTags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {question.conceptTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="font-normal text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-ink-faint tnum">
                      {question.points} pts
                    </span>
                    {noAnswer ? (
                      <Badge variant="outline">Skipped</Badge>
                    ) : isPending ? (
                      <Badge variant="outline">Grading in progress</Badge>
                    ) : isCorrect ? (
                      <Badge variant="success">Correct</Badge>
                    ) : (
                      <Badge variant="destructive">Incorrect</Badge>
                    )}
                  </div>
                </header>

                <div className="hairline" />

                <div className="flex flex-col gap-3">
                  <span className="eyebrow text-ink-faint">Response</span>
                  <div className="text-ink">
                    {noAnswer ? (
                      <em className="text-ink-faint">No answer provided.</em>
                    ) : (
                      <span>{String(answerValue)}</span>
                    )}
                  </div>

                  {question.type === "MULTIPLE_CHOICE" &&
                  Array.isArray(question.options) ? (
                    <ul className="flex flex-col gap-1.5 mt-2">
                      {(question.options as string[]).map((opt) => {
                        const isStudent = opt === answerValue;
                        const isAnswer = opt === question.correctAnswer;
                        return (
                          <li
                            key={opt}
                            className={`text-sm flex items-center gap-2 ${
                              isAnswer
                                ? "text-success"
                                : isStudent
                                  ? "text-danger"
                                  : "text-ink-muted"
                            }`}
                          >
                            <span className="font-mono text-xs">
                              {isAnswer ? "✓" : isStudent ? "✗" : "·"}
                            </span>
                            {opt}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  {question.type !== "SHORT_ANSWER" && question.correctAnswer ? (
                    <p className="text-xs text-ink-faint mt-1">
                      Expected:{" "}
                      <span className="text-ink-muted">
                        {String(question.correctAnswer)}
                      </span>
                    </p>
                  ) : null}
                </div>

                {question.type === "SHORT_ANSWER" && questionFeedback ? (
                  <GPTFeedbackDisplay
                    feedback={questionFeedback}
                    questionText={question.question}
                    studentAnswer={String(answerValue ?? "")}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
