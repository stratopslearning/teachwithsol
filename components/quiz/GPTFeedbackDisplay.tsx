import React from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  CircleDashed,
  Hourglass,
  Sparkles,
  X,
} from "@/components/icons";

import { detectRequiredMatchCount } from "@/lib/grading/questionIntent";
import type {
  GradingStatus,
  RubricCriterion,
  RubricMatch,
  StoredFeedback,
} from "@/lib/grading/types";

interface GPTFeedbackData {
  score: number | null;
  feedback: string;
  status?: GradingStatus;
  maxPoints?: number;
  confidence?: number;
  rubric?: RubricCriterion[];
  rubricMatches?: RubricMatch[];
  requiredMatchCount?: number | null;
}

interface GPTFeedbackDisplayProps {
  feedback: GPTFeedbackData | StoredFeedback;
  questionText: string;
  studentAnswer: string;
  className?: string;
}

function resolveStatus(
  feedback: GPTFeedbackData | StoredFeedback,
): GradingStatus {
  if (feedback.status === "pending" || feedback.status === "manual_review") {
    return feedback.status;
  }
  if (feedback.status === "graded") return "graded";
  return "graded";
}

type CriterionRow = {
  description: string;
  weight: number;
  state: "matched" | "partial" | "missed" | "optional";
  evidence?: string;
};

function countMatchedCriteria(matches: RubricMatch[] | undefined): number {
  return (matches ?? []).filter((m) => m.matched).length;
}

/**
 * Join the rubric (criterion definitions) with rubricMatches (model's verdicts)
 * so the UI can render full descriptions instead of raw "c1" / "c2" ids.
 *
 * Out-of-rubric model matches are dropped. Rubric criteria the model did not
 * address default to `missed` so the student sees the complete picture.
 */
function buildRubricRows(
  rubric: RubricCriterion[] | undefined,
  matches: RubricMatch[] | undefined,
  requiredMatchCount: number | null,
): CriterionRow[] {
  if (!rubric || rubric.length === 0) return [];
  const byId = new Map<string, RubricMatch>();
  for (const m of matches ?? []) byId.set(m.criterionId, m);

  const useAnyN =
    requiredMatchCount != null &&
    requiredMatchCount > 0 &&
    requiredMatchCount < rubric.length;
  const requirementMet =
    useAnyN && countMatchedCriteria(matches) >= requiredMatchCount;

  return rubric.map<CriterionRow>((criterion) => {
    const match = byId.get(criterion.id);
    let state: CriterionRow["state"];
    if (match?.matched) state = "matched";
    else if (match?.partial) state = "partial";
    else if (requirementMet) state = "optional";
    else state = "missed";

    return {
      description: criterion.description,
      weight: criterion.weight,
      state,
      evidence: match?.evidence ? match.evidence : undefined,
    };
  });
}

function RubricBreakdown({
  rubric,
  matches,
  requiredMatchCount,
}: {
  rubric?: RubricCriterion[];
  matches?: RubricMatch[];
  requiredMatchCount: number | null;
}) {
  const rows = buildRubricRows(rubric, matches, requiredMatchCount);
  if (rows.length === 0) return null;

  const useAnyN =
    requiredMatchCount != null &&
    requiredMatchCount > 0 &&
    rubric != null &&
    requiredMatchCount < rubric.length;

  return (
    <div className="mt-4">
      <div className="eyebrow text-ink-faint mb-2">Rubric breakdown</div>
      {useAnyN ? (
        <p className="text-xs text-ink-muted mb-3 leading-relaxed">
          This question required any {requiredMatchCount} of the points below.
          Only {requiredMatchCount} correct point
          {requiredMatchCount === 1 ? "" : "s"} were needed for full credit.
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {rows.map((row, idx) => {
          const icon =
            row.state === "matched" ? (
              <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
            ) : row.state === "partial" ? (
              <CircleDashed className="h-4 w-4 text-warning-fg shrink-0 mt-0.5" />
            ) : row.state === "optional" ? (
              <Circle className="h-4 w-4 text-ink-faint shrink-0 mt-0.5" />
            ) : (
              <X className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            );
          const stateLabel =
            row.state === "matched"
              ? "Met"
              : row.state === "partial"
                ? "Partially met"
                : row.state === "optional"
                  ? "Optional"
                  : "Missing";
          const stateColor =
            row.state === "matched"
              ? "text-success"
              : row.state === "partial"
                ? "text-warning-fg"
                : row.state === "optional"
                  ? "text-ink-muted"
                  : "text-danger";
          return (
            <li
              key={idx}
              className="flex gap-3 items-start text-sm"
            >
              {icon}
              <div className="flex-1 min-w-0">
                <div className="text-ink leading-snug">
                  <span className={`font-medium ${stateColor}`}>
                    {stateLabel}:
                  </span>{" "}
                  {row.description}
                </div>
                {row.evidence ? (
                  <div className="text-xs text-ink-muted mt-1 italic">
                    Your answer: &ldquo;{row.evidence}&rdquo;
                  </div>
                ) : null}
              </div>
              <span className="text-xs text-ink-faint tnum shrink-0">
                {row.weight === 1 ? "" : `weight ${row.weight}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function GPTFeedbackDisplay({
  feedback,
  questionText,
  className = "",
}: GPTFeedbackDisplayProps) {
  const status = resolveStatus(feedback);
  const rubric =
    "rubric" in feedback ? (feedback.rubric as RubricCriterion[] | undefined) : undefined;
  const matches =
    "rubricMatches" in feedback
      ? (feedback.rubricMatches as RubricMatch[] | undefined)
      : undefined;
  const storedRequired =
    "requiredMatchCount" in feedback
      ? (feedback.requiredMatchCount as number | null | undefined)
      : undefined;
  const requiredMatchCount =
    storedRequired ?? detectRequiredMatchCount(questionText);

  if (status === "pending") {
    return (
      <section
        className={`border border-warning/30 bg-warning-soft/40 rounded-md p-5 ${className}`}
      >
        <header className="flex items-center gap-2 eyebrow text-warning-fg">
          <Hourglass className="h-3.5 w-3.5" />
          Grading in progress
        </header>
        <p className="mt-3 text-sm text-ink leading-relaxed max-w-prose">
          {feedback.feedback ||
            "Your answer is still being reviewed. The score for this question is not finalized yet. Please check back shortly."}
        </p>
        <div className="mt-4 hairline" />
        <div className="mt-3 flex items-baseline gap-2">
          <span className="eyebrow text-ink-faint">Score</span>
          <span className="font-display text-lg text-ink-faint tnum">
           . / {feedback.maxPoints ?? "?"}
          </span>
        </div>
      </section>
    );
  }

  if (status === "manual_review") {
    return (
      <section
        className={`border border-danger/30 bg-danger-soft/40 rounded-md p-5 ${className}`}
      >
        <header className="flex items-center gap-2 eyebrow text-danger-fg">
          <AlertTriangle className="h-3.5 w-3.5" />
          Awaiting instructor review
        </header>
        <p className="mt-3 text-sm text-ink leading-relaxed max-w-prose">
          {feedback.feedback ||
            "This response could not be auto-graded after multiple attempts and will be reviewed by your instructor."}
        </p>
        <div className="mt-4 hairline" />
        <div className="mt-3 flex items-baseline gap-2">
          <span className="eyebrow text-ink-faint">Score</span>
          <span className="font-display text-lg text-ink-faint tnum">
           . / {feedback.maxPoints ?? "?"}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`border border-info/30 bg-info-soft/40 rounded-md p-5 ${className}`}
    >
      <header className="flex items-center gap-2 eyebrow text-info-fg">
        <Sparkles className="h-3.5 w-3.5" />
        AI feedback
      </header>
      <p className="mt-3 text-sm text-ink leading-relaxed max-w-prose">
        {feedback.feedback}
      </p>

      <RubricBreakdown
        rubric={rubric}
        matches={matches}
        requiredMatchCount={requiredMatchCount}
      />

      <div className="mt-4 hairline" />
      <div className="mt-3 flex items-baseline gap-2">
        <span className="eyebrow text-ink-faint">Score</span>
        <span className="font-display text-lg text-ink tnum">
          {feedback.score ?? 0}
          {feedback.maxPoints !== undefined ? ` / ${feedback.maxPoints}` : ""}
        </span>
      </div>
    </section>
  );
}
