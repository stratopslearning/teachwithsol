"use client";

import { useEffect, useState } from "react";

import type { OutlineItemBody } from "@/app/db/schema";
import { DEFAULT_PASSING_SCORE } from "@/lib/quizSchemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function toLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromLocalDate(local: string, endOfDay = false): string | null {
  if (!local.trim()) return null;
  const d = new Date(`${local}T${endOfDay ? "23:59:00" : "00:00:00"}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type QuizSettingsValues = {
  maxAttempts: number;
  passingScore: number;
  timeLimit: number | null;
  startDate: string | null;
  endDate: string | null;
};

export function quizSettingsFromBody(body: OutlineItemBody): QuizSettingsValues {
  return {
    maxAttempts: body.maxAttempts ?? 1,
    passingScore: body.passingScore ?? DEFAULT_PASSING_SCORE,
    timeLimit: body.timeLimit ?? null,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
  };
}

const fieldClass =
  "h-7 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs tabular-nums";

export function QuizSettingsEditor({
  body,
  disabled,
  onSave,
}: {
  body: OutlineItemBody;
  disabled?: boolean;
  onSave: (patch: QuizSettingsValues) => void | Promise<void>;
}) {
  const initial = quizSettingsFromBody(body);
  const [maxAttempts, setMaxAttempts] = useState(String(initial.maxAttempts));
  const [passingScore, setPassingScore] = useState(String(initial.passingScore));
  const [timeLimit, setTimeLimit] = useState(
    initial.timeLimit != null ? String(initial.timeLimit) : "",
  );
  const [startLocal, setStartLocal] = useState(toLocalDate(initial.startDate));
  const [endLocal, setEndLocal] = useState(toLocalDate(initial.endDate));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = quizSettingsFromBody(body);
    setMaxAttempts(String(next.maxAttempts));
    setPassingScore(String(next.passingScore));
    setTimeLimit(next.timeLimit != null ? String(next.timeLimit) : "");
    setStartLocal(toLocalDate(next.startDate));
    setEndLocal(toLocalDate(next.endDate));
  }, [body]);

  const nextValues = (): QuizSettingsValues => ({
    maxAttempts: Math.max(1, Math.floor(Number(maxAttempts) || 1)),
    passingScore: Math.min(
      100,
      Math.max(0, Math.floor(Number(passingScore) || DEFAULT_PASSING_SCORE)),
    ),
    timeLimit:
      timeLimit.trim() === ""
        ? null
        : Math.max(1, Math.floor(Number(timeLimit) || 1)),
    startDate: fromLocalDate(startLocal, false),
    endDate: fromLocalDate(endLocal, true),
  });

  const draft = nextValues();
  const dirty =
    draft.maxAttempts !== initial.maxAttempts ||
    draft.passingScore !== initial.passingScore ||
    draft.timeLimit !== initial.timeLimit ||
    toLocalDate(draft.startDate) !== toLocalDate(initial.startDate) ||
    toLocalDate(draft.endDate) !== toLocalDate(initial.endDate);

  async function handleSave() {
    if (
      draft.startDate &&
      draft.endDate &&
      new Date(draft.endDate) <= new Date(draft.startDate)
    ) {
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">Opens</span>
          <Input
            type="date"
            value={startLocal}
            disabled={disabled || saving}
            onChange={(e) => setStartLocal(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">Due</span>
          <Input
            type="date"
            value={endLocal}
            disabled={disabled || saving}
            onChange={(e) => setEndLocal(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">Minutes</span>
          <Input
            type="number"
            min={1}
            placeholder="—"
            value={timeLimit}
            disabled={disabled || saving}
            onChange={(e) => setTimeLimit(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">Attempts</span>
          <Input
            type="number"
            min={1}
            value={maxAttempts}
            disabled={disabled || saving}
            onChange={(e) => setMaxAttempts(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">Pass %</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              max={100}
              value={passingScore}
              disabled={disabled || saving}
              onChange={(e) => setPassingScore(e.target.value)}
              className={fieldClass}
            />
            <Button
              type="button"
              size="sm"
              variant={dirty ? "default" : "ghost"}
              className="h-7 shrink-0 px-2 text-xs"
              disabled={disabled || saving || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? "…" : "Save"}
            </Button>
          </div>
        </label>
      </div>
    </div>
  );
}
