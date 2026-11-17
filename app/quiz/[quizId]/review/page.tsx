import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { GPTFeedbackDisplay } from "@/components/quiz/GPTFeedbackDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/basePath";
import { appRedirect } from "@/lib/serverRedirect";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { normalizeDatabaseDate } from "@/lib/utils";
import {
  buildLegacyQuestionKeyMap,
  resolveAttemptAnswer,
  resolveAttemptFeedback,
} from "@/lib/quiz/attemptAnswers";
import { isPendingStatus } from "@/lib/grading/types";
import {
  attemptNeedsBackgroundRetry,
  scheduleAttemptRetry,
} from "@/lib/quiz/backgroundRetry";
import {
  listGradeOverrideHistoryForAttempt,
  quizGradesAreReleased,
} from "@/lib/professor/overrides";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";
import { loadOwnAttempt, loadQuizQuestions } from "@/lib/quiz/gradingData";
import { shouldHideFeedbackForStudent } from "@/lib/quiz/feedback";

interface ReviewPageProps {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}

export default async function ReviewPage({
  params,
  searchParams,
}: ReviewPageProps) {
  const p = await params;
  const sp = await searchParams;
  const attemptId = sp.attemptId;
  const quizId = p.quizId;
  const user = await getOrCreateUser();
  if (!user) appRedirect("/login");

  if (!attemptId) appRedirect("/dashboard/student");

  // FORCE RLS: plain db reads return no attempt / questions. Load via the
  // definer (ownership checked) and read questions under the attempt's tenant.
  const own = await loadOwnAttempt(attemptId, user.id);
  if (!own || own.attempt.quizId !== quizId || !own.attempt.tenantId) {
    appRedirect("/dashboard/student");
  }
  const { attempt, quiz } = own;
  const quizQuestions = await loadQuizQuestions(quizId, attempt.tenantId!);
  const answers: Record<string, any> = (attempt.answers as any) || {};
  const gptFeedback: Record<string, any> = attempt.gptFeedback || {};
  const questionKeyMap = buildLegacyQuestionKeyMap(
    quizQuestions.map((question) => ({
      id: question.id,
      order: question.order,
      question: question.question,
      correctAnswer: question.correctAnswer,
    })),
    answers,
    gptFeedback,
  );

  const shouldHideFeedback = shouldHideFeedbackForStudent(
    quiz,
    'STUDENT',
  );

  const gradesReleased = quizGradesAreReleased(quiz);
  const overrideHistory = gradesReleased
    ? await listGradeOverrideHistoryForAttempt(attempt.id)
    : [];
  const overridesByQuestion = new Map<
    string,
    Array<(typeof overrideHistory)[number]>
  >();
  for (const entry of overrideHistory) {
    if (!entry.questionId) continue;
    const list = overridesByQuestion.get(entry.questionId) ?? [];
    list.push(entry);
    overridesByQuestion.set(entry.questionId, list);
  }

  // Self-heal: if any question on this attempt is still pending or in
  // manual_review, kick off a background re-grade so the next refresh
  // most likely shows a finalized score. Cheap; runs after the response.
  if (attempt.tenantId && attemptNeedsBackgroundRetry(gptFeedback)) {
    scheduleAttemptRetry(attempt.id, attempt.tenantId);
  }

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
            label: "Quiz result",
            href: withBasePath(
              `/quiz/${quizId}/results?attemptId=${attemptId}`,
            ),
          },
          { label: "Review" },
        ]}
        eyebrow="Review"
        title={quiz.title}
        description="A walk through your responses, with feedback where available."
      />

      <section className="mt-12 flex flex-col gap-4">
        {quizQuestions.map((q, idx) => {
          const studentAnswer = resolveAttemptAnswer(q.id, answers, questionKeyMap);
          const questionFeedback = resolveAttemptFeedback(
            q.id,
            gptFeedback,
            questionKeyMap,
          );
          const noAnswer =
            studentAnswer === undefined ||
            studentAnswer === null ||
            studentAnswer === "";
          const isPending =
            q.type === "SHORT_ANSWER" &&
            isPendingStatus(questionFeedback?.status);
          let isCorrect = false;
          if (q.type === "SHORT_ANSWER") {
            isCorrect = questionFeedback?.score === q.points;
          } else {
            isCorrect = studentAnswer === q.correctAnswer;
          }

          return (
            <article key={q.id} className="paper paper-shadow p-6 md:p-8">
              <header className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex flex-col gap-1">
                  <span className="eyebrow text-ink-faint">
                    Question {idx + 1}
                  </span>
                  <h2 className="font-display text-xl text-ink leading-snug">
                    {q.question}
                  </h2>
                </div>
                <div className="shrink-0">
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

              <div className="mt-5 hairline" />

              <div className="mt-5 flex flex-col gap-3">
                <span className="eyebrow text-ink-faint">Your answer</span>
                <div className="text-ink">
                  {noAnswer ? (
                    <em className="text-ink-faint">No answer</em>
                  ) : (
                    String(studentAnswer)
                  )}
                </div>
                {!shouldHideFeedback &&
                q.type !== "SHORT_ANSWER" &&
                q.correctAnswer ? (
                  <p className="text-xs text-ink-faint">
                    Expected:{" "}
                    <span className="text-ink-muted">
                      {String(q.correctAnswer)}
                    </span>
                  </p>
                ) : null}
              </div>

              {q.type === "SHORT_ANSWER" &&
              questionFeedback &&
              !shouldHideFeedback ? (
                <div className="mt-6">
                  <GPTFeedbackDisplay
                    feedback={questionFeedback}
                    questionText={q.question}
                    studentAnswer={String(studentAnswer ?? "")}
                  />
                </div>
              ) : null}

              {q.type !== "SHORT_ANSWER" &&
              questionFeedback?.feedback &&
              !shouldHideFeedback ? (
                <div className="mt-6 border border-info/30 bg-info-soft/40 rounded-md p-4">
                  <span className="eyebrow text-info-fg">Feedback</span>
                  <p className="text-sm text-ink mt-2">
                    {questionFeedback.feedback}
                  </p>
                </div>
              ) : null}

              {shouldHideFeedback ? (
                <div className="mt-6 border border-warning/30 bg-warning-soft/40 rounded-md p-4">
                  <span className="eyebrow text-warning-fg">Feedback</span>
                  <p className="text-sm text-ink-muted italic mt-2">
                    {quiz.endDate &&
                    (() => {
                      const endDate = normalizeDatabaseDate(quiz.endDate);
                      return endDate ? new Date() <= endDate : false;
                    })()
                      ? "Feedback will be available after the due date."
                      : "Feedback is now available."}
                  </p>
                </div>
              ) : null}

              {!shouldHideFeedback &&
              gradesReleased &&
              (overridesByQuestion.get(q.id)?.length ?? 0) > 0 ? (
                <div className="mt-6 border border-border bg-muted/30 rounded-md p-4">
                  <span className="eyebrow text-ink-faint">
                    Instructor grade note
                  </span>
                  <ul className="mt-2 flex flex-col gap-3 list-none p-0 m-0">
                    {overridesByQuestion.get(q.id)!.map((entry) => (
                      <li key={entry.id} className="text-sm text-ink">
                        <p>{entry.note}</p>
                        <p className="text-xs text-ink-faint mt-1">
                          <LocalDateTime stacked value={entry.createdAt} />
                          {entry.numericScore != null
                            ? ` · adjusted to ${entry.numericScore} pts`
                            : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      <div className="mt-12 flex flex-col sm:flex-row gap-3 justify-center">
        <Button asChild>
          <a
            href={withBasePath(
              `/quiz/${quizId}/results?attemptId=${attemptId}`,
            )}
          >
            Back to result
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={withBasePath("/dashboard/student")}>Back to dashboard</a>
        </Button>
      </div>
    </AppShell>
  );
}
