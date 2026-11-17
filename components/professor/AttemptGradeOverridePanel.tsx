'use client';

import { apiFetch } from '@/lib/api/client';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { RubricCriterion } from '@/lib/gradingTypes';
import { LocalDateTime } from '@/components/timezone/LocalDateTime';
import { useRouter } from 'next/navigation';

export type OverrideHistoryEntry = {
  id: string;
  questionId: string | null;
  numericScore: number | null;
  criteriaOverrides: Record<string, boolean> | null;
  note: string;
  createdAt: string;
  actorLabel: string;
};

export type OverrideTargetQuestion = {
  id: string;
  order: number;
  label: string;
  points: number;
  type: string;
  rubric: RubricCriterion[];
  criteriaState: Record<string, boolean>;
};

type AttemptGradeOverridePanelProps = {
  attemptId: string;
  maxScore: number;
  questions: OverrideTargetQuestion[];
  history: OverrideHistoryEntry[];
  canOverride: boolean;
};

export function AttemptGradeOverridePanel({
  attemptId,
  maxScore,
  questions,
  history,
  canOverride,
}: AttemptGradeOverridePanelProps) {
  const router = useRouter();
  const [scope, setScope] = useState<'whole' | 'question'>('question');
  const [questionId, setQuestionId] = useState<string>(
    questions[0]?.id ?? '',
  );
  const [numericScore, setNumericScore] = useState('');
  const [criteriaOverrides, setCriteriaOverrides] = useState<
    Record<string, boolean>
  >(() => (questions[0] ? { ...questions[0].criteriaState } : {}));
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === questionId),
    [questions, questionId],
  );

  function syncCriteriaFromQuestion(q: OverrideTargetQuestion | undefined) {
    if (!q) {
      setCriteriaOverrides({});
      return;
    }
    setCriteriaOverrides({ ...q.criteriaState });
  }

  function handleQuestionChange(nextId: string) {
    setQuestionId(nextId);
    const q = questions.find((item) => item.id === nextId);
    syncCriteriaFromQuestion(q);
    setNumericScore('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canOverride) return;

    const trimmedNote = note.trim();
    if (!trimmedNote) {
      toast.error('A note is required for every override.');
      return;
    }

    const parsedNumeric =
      numericScore.trim() === '' ? null : Number.parseInt(numericScore, 10);
    const hasNumeric =
      parsedNumeric != null && !Number.isNaN(parsedNumeric);
    const rubricTogglesActive =
      scope === 'question' &&
      selectedQuestion?.type === 'SHORT_ANSWER' &&
      (selectedQuestion.rubric.length ?? 0) > 0;
    const hasCriteria =
      rubricTogglesActive && Object.keys(criteriaOverrides).length > 0;

    if (!hasNumeric && !hasCriteria) {
      toast.error('Set a numeric score and/or adjust rubric criteria.');
      return;
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        note: trimmedNote,
      };
      if (scope === 'question') {
        body.questionId = questionId;
      } else {
        body.questionId = null;
      }
      if (hasNumeric) body.numericScore = parsedNumeric;
      if (hasCriteria) body.criteriaOverrides = criteriaOverrides;

      const res = await apiFetch(`/api/professor/attempt/${attemptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to save override');
        return;
      }

      toast.success('Grade override saved.');
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save override');
    } finally {
      setIsSaving(false);
    }
  }

  const showRubricToggles =
    scope === 'question' &&
    selectedQuestion &&
    selectedQuestion.type === 'SHORT_ANSWER' &&
    selectedQuestion.rubric.length > 0;

  const maxForNumeric =
    scope === 'whole' ? maxScore : (selectedQuestion?.points ?? maxScore);

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <p className="text-sm text-ink-muted">
          Set a numeric score or flip rubric criteria. The original AI grading
          stays on the attempt; each change requires a note for the audit trail.
        </p>

        {!canOverride ? (
          <p className="text-sm text-ink-faint">
            Overrides are available after the learner submits.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="override-scope">Override target</Label>
            <Select
              value={scope}
              onValueChange={(v) => {
                const next = v as 'whole' | 'question';
                setScope(next);
                if (next === 'question') {
                  syncCriteriaFromQuestion(selectedQuestion);
                }
                setNumericScore('');
              }}
              disabled={!canOverride || isSaving}
            >
              <SelectTrigger id="override-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="question">Single question</SelectItem>
                <SelectItem value="whole">Whole attempt score</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'question' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="override-question">Question</Label>
              <Select
                value={questionId}
                onValueChange={handleQuestionChange}
                disabled={!canOverride || isSaving || questions.length === 0}
              >
                <SelectTrigger id="override-question">
                  <SelectValue placeholder="Select question" />
                </SelectTrigger>
                <SelectContent>
                  {questions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      Q{q.order + 1}: {q.label.slice(0, 48)}
                      {q.label.length > 48 ? '…' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 max-w-xs">
          <Label htmlFor="override-numeric">
            Numeric score (0–{maxForNumeric})
          </Label>
          <Input
            id="override-numeric"
            type="number"
            min={0}
            max={maxForNumeric}
            step={1}
            value={numericScore}
            onChange={(e) => setNumericScore(e.target.value)}
            disabled={!canOverride || isSaving}
            placeholder="Optional if using criteria"
          />
        </div>

        {showRubricToggles ? (
          <div className="flex flex-col gap-3">
            <span className="eyebrow text-ink-faint">Rubric criteria</span>
            <ul className="flex flex-col gap-3 m-0 p-0 list-none">
              {selectedQuestion!.rubric.map((criterion) => (
                <li
                  key={criterion.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-rule/70 px-4 py-3"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-medium text-ink">
                      {criterion.id}
                    </span>
                    <span className="text-sm text-ink-muted">
                      {criterion.description}
                    </span>
                  </div>
                  <Switch
                    checked={criteriaOverrides[criterion.id] ?? false}
                    onCheckedChange={(checked) =>
                      setCriteriaOverrides((prev) => ({
                        ...prev,
                        [criterion.id]: checked,
                      }))
                    }
                    disabled={!canOverride || isSaving}
                    aria-label={`Criterion ${criterion.id} met`}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="override-note">Note (required)</Label>
          <Textarea
            id="override-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!canOverride || isSaving}
            rows={3}
            placeholder="Why you changed this score (visible in override history)."
          />
        </div>

        <div>
          <Button type="submit" disabled={!canOverride || isSaving}>
            {isSaving ? 'Saving…' : 'Save override'}
          </Button>
        </div>
      </form>

      {history.length > 0 ? (
        <div className="flex flex-col gap-4">
          <span className="eyebrow text-ink-faint">Override history</span>
          <ol className="flex flex-col gap-3 list-none m-0 p-0">
            {history.map((entry) => {
              const q = entry.questionId
                ? questions.find((item) => item.id === entry.questionId)
                : null;
              const targetLabel = entry.questionId
                ? q
                  ? `Question ${q.order + 1}`
                  : 'Question'
                : 'Whole attempt';
              return (
                <li
                  key={entry.id}
                  className="rounded-lg border border-rule/70 px-4 py-3 bg-surface-sunken/30"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {targetLabel}
                      {entry.numericScore != null ? (
                        <span className="text-ink-muted font-normal">
                          {' '}
                          · score → {entry.numericScore}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-ink-faint tnum">
                      <LocalDateTime value={entry.createdAt} />
                    </span>
                  </div>
                  <p className="text-xs text-ink-faint mt-1">{entry.actorLabel}</p>
                  <p className="text-sm text-ink mt-2">{entry.note}</p>
                  {entry.criteriaOverrides &&
                  Object.keys(entry.criteriaOverrides).length > 0 ? (
                    <p className="text-xs text-ink-muted mt-2">
                      Rubric criteria adjusted (
                      {Object.entries(entry.criteriaOverrides)
                        .map(([id, met]) => `${id}: ${met ? 'met' : 'not met'}`)
                        .join(', ')}
                      ).
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
