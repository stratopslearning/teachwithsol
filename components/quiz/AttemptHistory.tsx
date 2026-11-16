"use client";

import { apiFetch } from "@/lib/api/client";
import { useEffect, useState } from "react";
import { AlertCircle, Award, Clock, RefreshCw } from "@/components/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/patterns/LoadingState";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";

interface Attempt {
  id: string;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
  attemptNumber: number;
  gptFeedback?: any;
}

interface AttemptHistoryProps {
  quizId: string;
  assignmentId: string;
  onRetake?: () => void;
}

export function AttemptHistory({
  quizId,
  assignmentId,
  onRetake,
}: AttemptHistoryProps) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [bestScore, setBestScore] = useState(0);
  const [bestPercentage, setBestPercentage] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [attemptsRemaining, setAttemptsRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAttemptHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, assignmentId]);

  const fetchAttemptHistory = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/quiz/${quizId}/attempts?assignmentId=${assignmentId}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch attempts");
      }

      setAttempts(data.attempts);
      setBestScore(data.bestScore);
      setBestPercentage(data.bestPercentage);
      setTotalAttempts(data.totalAttempts);
      setMaxAttempts(data.maxAttempts);
      setAttemptsRemaining(data.attemptsRemaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attempts");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading attempt history…" />;
  }

  if (error) {
    return (
      <div className="paper paper-shadow p-6 text-center">
        <AlertCircle className="h-6 w-6 text-danger mx-auto mb-3" />
        <p className="text-ink-muted text-sm mb-4">{error}</p>
        <Button onClick={fetchAttemptHistory} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="paper paper-shadow p-8 text-center">
        <p className="text-ink-muted">
          No attempts yet. Take the quiz to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <article className="paper paper-shadow p-6">
        <div className="flex items-center gap-2 eyebrow text-ink-faint">
          <Award className="h-3.5 w-3.5" />
          Best score
        </div>
        <div className="mt-3 flex items-end gap-4 flex-wrap">
          <div className="stat-numeral text-5xl text-ink leading-none">
            {bestPercentage}
            <span className="text-3xl text-ink-muted">%</span>
          </div>
          <div className="text-sm text-ink-muted tnum pb-1">
            {bestScore}/{attempts[0]?.maxScore || 0} pts
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs text-ink-faint tnum flex-wrap">
          <span>Attempts: {totalAttempts}</span>
          <span>·</span>
          <span>Max: {maxAttempts}</span>
          <span>·</span>
          <span>Remaining: {attemptsRemaining}</span>
        </div>
      </article>

      <section>
        <div className="eyebrow text-ink-faint mb-3">Attempt log</div>
        <ul className="paper paper-shadow divide-y divide-rule overflow-hidden">
          {attempts.map((attempt) => {
            const isBest =
              attempt.score === bestScore && attempt.score > 0;
            return (
              <li
                key={attempt.id}
                className="px-5 py-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={isBest ? "default" : "outline"}>
                    Attempt {attempt.attemptNumber}
                  </Badge>
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint whitespace-normal min-w-0">
                    <Clock className="h-3 w-3 shrink-0" />
                    <LocalDateTime stacked value={attempt.submittedAt} />
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg text-ink tnum">
                    {attempt.percentage}%
                  </div>
                  <div className="text-xs text-ink-faint tnum">
                    {attempt.score}/{attempt.maxScore}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {attemptsRemaining > 0 && onRetake ? (
        <div className="paper paper-shadow p-6 text-center">
          <p className="text-ink-muted text-sm mb-4">
            You have{" "}
            <span className="text-ink font-medium tnum">
              {attemptsRemaining}
            </span>{" "}
            attempt{attemptsRemaining > 1 ? "s" : ""} remaining
          </p>
          <Button onClick={onRetake}>
            <RefreshCw className="h-4 w-4" />
            Retake quiz
          </Button>
        </div>
      ) : null}

      {attemptsRemaining === 0 ? (
        <div className="paper paper-shadow p-6 text-center text-sm text-ink-muted">
          Maximum attempts reached. Your best score is{" "}
          <span className="text-ink font-medium">
            {bestPercentage}% ({bestScore}/{attempts[0]?.maxScore || 0})
          </span>
          .
        </div>
      ) : null}
    </div>
  );
}
