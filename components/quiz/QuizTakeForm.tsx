"use client";

import * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { QuizUnavailable } from "@/components/quiz/QuizUnavailable";
import { QuizTimer } from "@/components/quiz/QuizTimer";
import { Clock } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useRef, useEffect, useCallback } from "react";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";
import { getRemainingSeconds } from "@/lib/quizTimeLimit";
import { shouldHideFeedbackForStudent, cleanQuizDescription } from "@/lib/utils";
import { apiUrl, withBasePath } from "@/lib/basePath";
import {
  startApiErrorToBlockCode,
  type QuizBlockCode,
} from "@/lib/quizBlockCopy";

interface QuizTakeFormProps {
  quiz: {
    id: string;
    title: string;
    description?: string;
    timeLimit?: number;
    endDate?: string | null;
    totalQuestions: number;
  };
  questions: Array<{
    id: string;
    type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
    question: string;
    options?: string[];
    order: number;
    points: number;
  }>;
  assignmentId: string;
  userId: string;
  userRole?: string;
}

type AnswerMap = Record<string, string>;

type ResultMap = {
  correct: boolean;
  feedback?: string;
};

export function QuizTakeForm({ quiz, questions, assignmentId, userId: _userId, userRole = 'STUDENT' }: QuizTakeFormProps) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted] = useState(false);
  const [results] = useState<Record<string, ResultMap> | null>(null);
  const [score] = useState<number | null>(null);
  const [gptFeedback] = useState<Record<string, string>>({});
  const [timeUp, setTimeUp] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [timerInitialSeconds, setTimerInitialSeconds] = useState<number | null>(null);
  const [showResumeWarning, setShowResumeWarning] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [startBlock, setStartBlock] = useState<QuizBlockCode | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const router = useRouter();
  const submittingRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);
  const answersRef = useRef<AnswerMap>({});
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef(true);

  // Check if feedback should be hidden for this user
  const shouldHideFeedback = shouldHideFeedbackForStudent(
    {
      endDate: quiz.endDate ? new Date(quiz.endDate) : null,
      description: quiz.description || null,
    },
    userRole,
  );

  const startQuiz = useCallback(async () => {
    if (quizStarted || starting) return;
    setStarting(true);
    try {
      const res = await fetch(apiUrl(`/api/quiz/${quiz.id}/start`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      if (res.ok) {
        const data = await res.json();

        if (data.serverAutoSubmitted && data.attemptId) {
          router.push(
            withBasePath(`/quiz/${quiz.id}/results?attemptId=${data.attemptId}`),
          );
          return;
        }

        setStartedAt(data.startedAt);

        const restored =
          data.answers && typeof data.answers === "object"
            ? (data.answers as AnswerMap)
            : {};
        if (Object.keys(restored).length > 0) {
          setAnswers(restored);
          answersRef.current = restored;
        }
        skipNextAutosaveRef.current = true;

        let remaining: number | null = null;
        if (typeof data.remainingSeconds === "number") {
          remaining = data.remainingSeconds;
        } else if (quiz.timeLimit && data.startedAt) {
          remaining =
            getRemainingSeconds(quiz.timeLimit, new Date(data.startedAt)) ??
            null;
        }

        if (quiz.timeLimit && remaining != null) {
          setTimerInitialSeconds(remaining);
          if (data.resumed && remaining < 120) {
            setShowResumeWarning(true);
          }
          if (remaining <= 0 || data.forceAutoSubmit) {
            setTimeUp(true);
          }
        } else if (data.forceAutoSubmit) {
          setTimeUp(true);
        }

        setQuizStarted(true);
        setConfirmOpen(false);
      } else {
        const error = await res.json();
        const block = startApiErrorToBlockCode(error);
        if (block) {
          setStartBlock(block);
          setConfirmOpen(false);
          return;
        }
        toast.error("Failed to start quiz", {
          description: error.error || "Please try again in a moment.",
        });
      }
    } catch (err) {
      console.error("Error starting quiz:", err);
      toast.error("Failed to start quiz", {
        description: (err as Error).message,
      });
    } finally {
      setStarting(false);
    }
  }, [
    quizStarted,
    starting,
    quiz.id,
    quiz.timeLimit,
    assignmentId,
    router,
  ]);

  // Auto-submit when the quiz due date passes while the tab is open.
  useEffect(() => {
    if (!quiz.endDate || !quizStarted) return;
    const endMs = new Date(quiz.endDate).getTime();
    const triggerDueSubmit = () => setTimeUp(true);
    const msUntilDue = endMs - Date.now();
    if (msUntilDue <= 0) {
      triggerDueSubmit();
      return;
    }
    const timeout = setTimeout(triggerDueSubmit, msUntilDue);
    return () => clearTimeout(timeout);
  }, [quiz.endDate, quizStarted]);

  const saveProgress = useCallback(async () => {
    if (!quizStarted || submitting || !startedAt) return;
    const payload = answersRef.current;
    if (Object.keys(payload).length === 0) return;

    setSaveStatus("saving");
    try {
      const res = await fetch(apiUrl(`/api/quiz/${quiz.id}/progress`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, answers: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save progress");
      }
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [quiz.id, assignmentId, quizStarted, submitting, startedAt]);

  useEffect(() => {
    answersRef.current = answers;
    if (!quizStarted || submitting) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (Object.keys(answers).length === 0) return;

    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      saveProgress();
    }, 800);

    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [answers, quizStarted, submitting, saveProgress]);

  // 2. Auto-submit on exit if not all answered
  useEffect(() => {
    const handleAutoSubmit = async () => {
      if (submittingRef.current || !startedAt) return;
      submittingRef.current = true;
      try {
        await fetch(apiUrl(`/api/quiz/${quiz.id}/submit`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignmentId,
            answers: answersRef.current,
            autoSubmitted: true,
          }),
          keepalive: true,
        });
      } catch {
        // beforeunload path is best-effort; the server-side time-up
        // sweep will pick it up if this fetch was killed mid-flight.
      }
    };

    const flushSave = () => {
      if (!quizStarted || submittingRef.current) return;
      const payload = answersRef.current;
      if (Object.keys(payload).length === 0) return;
      fetch(apiUrl(`/api/quiz/${quiz.id}/progress`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, answers: payload }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      flushSave();
      if (timeUp || Object.keys(answersRef.current).length > 0) {
        handleAutoSubmit();
      }
      if (Object.keys(answers).length < questions.length && !timeUp) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // For in-app navigation (Next.js)
    const handleRouteChange = (_url: string) => {
      if (Object.keys(answers).length < questions.length) {
        if (!window.confirm("You haven’t answered all questions. Submit before leaving?")) {
          throw "Route change aborted by quiz lock";
        } else {
          handleAutoSubmit();
        }
      }
    };
    // @ts-expect-error App Router has no router.events; kept for Pages Router compatibility
    router.events?.on("routeChangeStart", handleRouteChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // @ts-expect-error App Router has no router.events; kept for Pages Router compatibility
      router.events?.off("routeChangeStart", handleRouteChange);
    };
  }, [answers, questions.length, assignmentId, quiz.id, router, startedAt, timeUp]);

  const answeredCount = Object.keys(answers).length;
  const progress = Math.round((answeredCount / questions.length) * 100);

  // Auto-submit when time is up (only once). We flag the submission as
  // auto-submitted so the server accepts it even past the grace period : 
  // the alternative is locking the student out of submitting at all.
  React.useEffect(() => {
    if (!timeUp || submitting || autoSubmitTriggeredRef.current) return;
    autoSubmitTriggeredRef.current = true;
    toast.warning("Time's up", {
      description: "Submitting your answers now…",
    });
    void handleSubmit(
      new Event('submit') as unknown as React.FormEvent<HTMLFormElement>,
      { autoSubmitted: true, answersOverride: answersRef.current },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp, submitting]);

  const handleChange = (qid: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  // Prevent copy/paste/cut operations
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A
    if (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'a')) {
      e.preventDefault();
    }
    // Prevent right-click context menu shortcuts
    if (e.key === 'F10' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleSubmit = async (
    e: React.FormEvent,
    options: {
      autoSubmitted?: boolean;
      answersOverride?: AnswerMap;
    } = {},
  ) => {
    e.preventDefault();
    if (!startedAt) {
      toast.error("Quiz not started", { description: "Please wait for the quiz to initialize." });
      return;
    }
    if (submittingRef.current && !options.autoSubmitted) return;
    submittingRef.current = true;
    setSubmitting(true);
    const payload = options.answersOverride ?? answersRef.current;
    try {
      const res = await fetch(apiUrl(`/api/quiz/${quiz.id}/submit`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          answers: payload,
          autoSubmitted: options.autoSubmitted ?? false,
        }),
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to submit quiz");
      }
      const data = await res.json();
      console.log('Quiz submitted successfully:', data);
      // Use router.push for better navigation
      router.push(`/quiz/${quiz.id}/results?attemptId=${data.attemptId}`);
    } catch (err) {
      console.error('Quiz submission error:', err);
      const message =
        err instanceof Error && err.name === "TimeoutError"
          ? "Grading took too long. Please try again. Your answers may have been saved."
          : (err as Error).message;
      toast.error("Submission failed", { description: message });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // --- UI ---
  if (startBlock) {
    return (
      <div className="bg-paper text-ink min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <QuizUnavailable
            code={startBlock}
            quizTitle={quiz.title}
            closedAt={quiz.endDate}
          />
        </div>
      </div>
    );
  }

  if (!quizStarted) {
    return (
      <div className="bg-paper text-ink min-h-screen flex items-center justify-center px-4 py-12">
        <section className="paper paper-shadow w-full max-w-lg p-6 md:p-8 space-y-6">
          <header className="space-y-2">
            <span className="eyebrow text-ink-faint">Quiz</span>
            <h1 className="font-display text-3xl text-ink leading-tight">
              {quiz.title}
            </h1>
            {quiz.description ? (
              <p className="text-sm text-ink-muted">
                {cleanQuizDescription(quiz.description)}
              </p>
            ) : null}
          </header>

          <ul className="space-y-2 text-sm text-ink-muted">
            <li>
              <span className="text-ink">{quiz.totalQuestions}</span> question
              {quiz.totalQuestions === 1 ? "" : "s"}
            </li>
            {quiz.timeLimit ? (
              <li>
                Timed attempt:{" "}
                <span className="text-ink">{quiz.timeLimit} minutes</span>
              </li>
            ) : (
              <li>No time limit</li>
            )}
            {quiz.endDate ? (
              <li>
                Due <LocalDateTime value={quiz.endDate} />
              </li>
            ) : null}
          </ul>

          <p className="text-sm text-ink-muted">
            Starting uses one attempt. The timer begins when you confirm.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={starting}
            >
              Start quiz
            </Button>
            <Button asChild type="button" variant="outline">
              <a href={withBasePath("/dashboard/student")}>Cancel</a>
            </Button>
          </div>
        </section>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start this quiz?</AlertDialogTitle>
              <AlertDialogDescription>
                {quiz.timeLimit
                  ? `You will have ${quiz.timeLimit} minutes once you begin. Leave this tab open until you submit.`
                  : "Your attempt begins when you confirm. Leave this tab open until you submit."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={starting}>Not yet</AlertDialogCancel>
              <AlertDialogAction
                disabled={starting}
                onClick={(e) => {
                  e.preventDefault();
                  void startQuiz();
                }}
              >
                {starting ? "Starting…" : "Begin attempt"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (submitted) {
    const totalPoints = questions.reduce((a, q) => a + q.points, 0);
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <section className="paper paper-shadow p-6">
          <header>
            <span className="eyebrow text-ink-faint">Result</span>
            <h2 className="font-display text-2xl text-ink mt-1">
              Quiz submitted
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Score{" "}
              <span className="font-display tnum text-ink">
                {score}
              </span>{" "}
              of <span className="tnum">{totalPoints}</span>.
            </p>
          </header>
          <div className="mt-5">
            <Button asChild variant="outline">
              <a href={withBasePath("/dashboard/student")}>Back to dashboard</a>
            </Button>
          </div>
          <div className="mt-8 space-y-4">
            {questions.map((q, idx) => (
              <article
                key={q.id}
                className="paper paper-shadow p-5"
              >
                <header className="flex flex-wrap items-center gap-2">
                  <span className="eyebrow text-ink-faint">
                    Question {idx + 1}
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {q.type.replace("_", " ")}
                  </Badge>
                  <span className="text-xs tnum text-ink-faint ml-auto">
                    {q.points} pts
                  </span>
                </header>
                <h3 className="font-display text-base text-ink mt-3">
                  {q.question}
                </h3>
                <div className="mt-3">
                  <Label className="eyebrow text-ink-faint">Your answer</Label>
                  <div className="mt-1 text-ink">
                    {answers[q.id] || (
                      <span className="italic text-ink-faint">No answer</span>
                    )}
                  </div>
                </div>
                {results && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {results[q.id]?.correct ? (
                      <Badge variant="success">Correct</Badge>
                    ) : (
                      <Badge variant="destructive">Incorrect</Badge>
                    )}
                    {results[q.id]?.feedback && !shouldHideFeedback && (
                      <span className="text-sm text-ink-muted">
                        {results[q.id].feedback}
                      </span>
                    )}
                    {gptFeedback[q.id] && !shouldHideFeedback && (
                      <span className="text-sm text-info">
                        AI: {gptFeedback[q.id]}
                      </span>
                    )}
                    {shouldHideFeedback && (
                      <span className="text-sm italic text-ink-faint">
                        {quiz.endDate && new Date() <= new Date(quiz.endDate)
                          ? "Feedback will be available after the due date."
                          : "Feedback is now available."}
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto py-12 px-6">
      {showResumeWarning && !timeUp && (
        <Alert className="mb-6">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Resuming a session that started earlier. The timer reflects your total
            time allowed for this attempt.
          </AlertDescription>
        </Alert>
      )}
      {submitting && (
        <Alert className="mb-6">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Grading your answers. This may take 1–2 minutes for short-answer quizzes.
            Please keep this tab open.
          </AlertDescription>
        </Alert>
      )}
      {timeUp && !submitting && (
        <Alert variant="destructive" className="mb-6">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Time&apos;s up. Your quiz is being submitted automatically.
          </AlertDescription>
        </Alert>
      )}
      <header className="paper paper-shadow p-6 md:p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2 max-w-prose">
            <span className="eyebrow text-ink-faint">In session</span>
            <h1 className="font-display text-3xl text-ink leading-tight">
              {quiz.title}
            </h1>
            {quiz.description ? (
              <p className="text-ink-muted">
                {cleanQuizDescription(quiz.description)}
              </p>
            ) : null}
          </div>
          {quiz.timeLimit && timerInitialSeconds != null && startedAt ? (
            <div className="inline-flex items-center gap-2 paper border border-rule px-3 py-2 rounded">
              <Clock className="h-4 w-4 text-ink-faint" />
              <QuizTimer
                key={startedAt}
                initialSeconds={timerInitialSeconds}
                onTimeUp={() => setTimeUp(true)}
                paused={submitting}
              />
            </div>
          ) : quiz.timeLimit ? (
            <div className="inline-flex items-center gap-2 paper border border-rule px-3 py-2 rounded text-sm text-ink-faint">
              <Clock className="h-4 w-4" />
              Starting timer…
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Badge variant="outline">{questions.length} questions</Badge>
          {quiz.endDate ? (
            <Badge variant="outline" className="whitespace-normal h-auto py-1.5">
              <span className="inline-flex flex-col items-start gap-0.5 text-left">
                <span>Due</span>
                <LocalDateTime stacked value={quiz.endDate} />
              </span>
            </Badge>
          ) : null}
          {quiz.timeLimit ? (
            <Badge variant="outline">{quiz.timeLimit} min</Badge>
          ) : null}
        </div>

        <div className="mt-4 hairline" />
        <div className="mt-4">
          <Progress value={progress} className="h-1.5" />
          <div className="text-xs text-ink-faint mt-2 tnum flex flex-wrap items-center gap-2">
            <span>
              {answeredCount} of {questions.length} answered
            </span>
            {quizStarted && saveStatus === "saving" ? (
              <span>· Saving…</span>
            ) : null}
            {quizStarted && saveStatus === "saved" ? (
              <span>· Saved</span>
            ) : null}
            {quizStarted && saveStatus === "error" ? (
              <span className="text-danger">· Save failed</span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        {questions.map((q, idx) => (
          <article key={q.id} className="paper paper-shadow p-6 md:p-8">
            <header className="flex items-center gap-2 flex-wrap">
              <span className="eyebrow text-ink-faint">
                Question {idx + 1} of {questions.length}
              </span>
              <span className="text-ink-faint">·</span>
              <Badge variant="outline">{q.type.replace("_", " ").toLowerCase()}</Badge>
              <span className="text-xs text-ink-faint tnum">{q.points} pts</span>
            </header>
            <h2 className="font-display text-xl md:text-2xl text-ink leading-tight mt-3">
              {q.question}
            </h2>
            <div className="mt-5 hairline" />
            <div className="mt-5">
              {q.type === "MULTIPLE_CHOICE" && q.options && (
                <RadioGroup
                  value={answers[q.id] || ""}
                  onValueChange={(val) => handleChange(q.id, val)}
                  disabled={submitting}
                  className="flex flex-col gap-2"
                  onKeyDown={handleKeyDown}
                  onContextMenu={handleContextMenu}
                >
                  {q.options.map((opt, i) => {
                    const id = `${q.id}-opt-${i}`;
                    const isSelected = answers[q.id] === opt;
                    return (
                      <Label
                        key={i}
                        htmlFor={id}
                        className={`flex items-start gap-3 px-4 py-3 rounded-md border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-brand bg-brand-soft/40"
                            : "border-rule hover:border-rule-strong hover:bg-surface-sunken/40"
                        }`}
                      >
                        <RadioGroupItem value={opt} id={id} className="mt-0.5" />
                        <span className="text-ink leading-snug">{opt}</span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              )}
              {q.type === "TRUE_FALSE" && (
                <RadioGroup
                  value={answers[q.id] || ""}
                  onValueChange={(val) => handleChange(q.id, val)}
                  disabled={submitting}
                  className="flex flex-col gap-2"
                  onKeyDown={handleKeyDown}
                  onContextMenu={handleContextMenu}
                >
                  {["true", "false"].map((value) => {
                    const isSelected = answers[q.id] === value;
                    return (
                      <Label
                        key={value}
                        htmlFor={`${q.id}-${value}`}
                        className={`flex items-center gap-3 px-4 py-3 rounded-md border cursor-pointer capitalize transition-colors ${
                          isSelected
                            ? "border-brand bg-brand-soft/40"
                            : "border-rule hover:border-rule-strong hover:bg-surface-sunken/40"
                        }`}
                      >
                        <RadioGroupItem value={value} id={`${q.id}-${value}`} />
                        <span className="text-ink">{value}</span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              )}
              {q.type === "SHORT_ANSWER" && (
                <Textarea
                  value={answers[q.id] || ""}
                  onChange={(e) => handleChange(q.id, e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onContextMenu={handleContextMenu}
                  placeholder="Compose your answer…"
                  disabled={submitting}
                  className="min-h-[140px]"
                />
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="mt-10 flex justify-end">
        <Button
          type="submit"
          disabled={submitting || !quizStarted}
          loading={submitting}
        >
          {!quizStarted
            ? "Starting quiz…"
            : submitting
              ? "Grading…"
              : "Submit quiz"}
        </Button>
      </div>
    </form>
  );
}
