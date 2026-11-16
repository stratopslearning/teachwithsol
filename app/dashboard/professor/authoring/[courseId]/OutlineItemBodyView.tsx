"use client";

import { useLocalDate } from "@/components/timezone/useLocalDate";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/badge";
import type { OutlineItemSummary } from "@/lib/authoring";
import type { OutlineItemBody } from "@/app/db/schema";
import { cn } from "@/lib/utils";

function QuestionPointsInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (points: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const n = Math.max(1, Math.floor(Number(draft) || 1));
    setDraft(String(n));
    if (n !== value) onCommit(n);
  }

  return (
    <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
      <input
        type="number"
        min={1}
        aria-label="Points"
        className="h-6 w-11 rounded-md border border-border bg-background px-1 text-center text-xs tabular-nums text-foreground"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span>pts</span>
    </label>
  );
}

function questionTypeLabel(type: string) {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return "Multiple choice";
    case "TRUE_FALSE":
      return "True / false";
    case "SHORT_ANSWER":
      return "Short answer";
    default:
      return type;
  }
}

function MarkdownBlock({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90 [&_h1]:text-base [&_h1]:font-medium [&_h2]:text-sm [&_h2]:font-medium [&_h3]:text-sm [&_h3]:font-medium [&_p]:text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

/** Render {{answer}} markers as blank chips instead of raw braces. */
function MarkedBlankText({ text }: { text: string }) {
  const parts: Array<{ kind: "text" | "blank"; value: string; key: string }> =
    [];
  const re = /\{\{([^}]+)\}\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({
        kind: "text",
        value: text.slice(last, match.index),
        key: `t-${i}`,
      });
    }
    parts.push({
      kind: "blank",
      value: match[1]?.trim() || "…",
      key: `b-${i}`,
    });
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < text.length) {
    parts.push({ kind: "text", value: text.slice(last), key: "t-end" });
  }

  return (
    <p className="leading-7 text-foreground/90">
      {parts.map((part) =>
        part.kind === "text" ? (
          <span key={part.key}>{part.value}</span>
        ) : (
          <span
            key={part.key}
            className="mx-0.5 inline-flex min-w-[4.5rem] items-center justify-center rounded-md border border-dashed border-brand/40 bg-brand/10 px-2 py-0.5 align-baseline text-xs font-medium text-foreground"
            title={`Blank: ${part.value}`}
          >
            {part.value}
          </span>
        ),
      )}
    </p>
  );
}

/** Human-readable body instead of raw JSON. */
export function OutlineItemBodyView({
  type,
  body,
  editable = false,
  onQuestionPointsChange,
}: {
  type: OutlineItemSummary["type"];
  body: OutlineItemBody;
  /** Allow inline edits (e.g. question points) before publish. */
  editable?: boolean;
  onQuestionPointsChange?: (index: number, points: number) => void;
}) {
  const localDate = useLocalDate();
  if (type === "LESSON") {
    const chapter = body.chapter;
    if (chapter?.kind === "interactive_chapter") {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Interactive chapter</Badge>
            <span className="text-xs text-muted-foreground">
              {chapter.sections.length} sections · practice checks
            </span>
          </div>
          {chapter.subtitle ? (
            <p className="text-sm text-muted-foreground">{chapter.subtitle}</p>
          ) : null}
          {chapter.learningObjectives?.length ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Learning objectives
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {chapter.learningObjectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ol className="flex flex-col gap-3">
            {chapter.sections.map((section, i) => (
              <li
                key={section.id || i}
                className="rounded-xl border border-border bg-background/50 p-3"
              >
                <p className="text-sm font-medium text-foreground">
                  {i + 1}. {section.title}
                </p>
                {section.markdown?.trim() ? (
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    <MarkdownBlock markdown={section.markdown} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reading not built yet.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Check bank · {section.checkBank?.length ?? 0} questions
                  (practice)
                </p>
              </li>
            ))}
          </ol>
        </div>
      );
    }

    const flashcards = body.flashcards ?? [];
    return (
      <div className="flex flex-col gap-4">
        {body.markdown?.trim() ? (
          <div className="rounded-xl border border-border bg-background/50 p-3">
            <MarkdownBlock markdown={body.markdown} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No lesson content yet.</p>
        )}
        {flashcards.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Flashcards · {flashcards.length}
            </p>
            <ul className="flex flex-col gap-2">
              {flashcards.map((card, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-foreground">{card.front}</p>
                  <p className="mt-1 text-muted-foreground">{card.back}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  if (type === "QUIZ") {
    const questions = body.questions ?? [];
    if (questions.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      );
    }
    const totalPts = questions.reduce((sum, q) => sum + (q.points ?? 1), 0);

    return (
      <div className="flex flex-col gap-2 pb-6">
        {!editable &&
        (body.maxAttempts != null ||
          body.passingScore != null ||
          body.timeLimit != null ||
          body.startDate ||
          body.endDate) ? (
          <p className="text-[11px] text-muted-foreground">
            {[
              body.startDate
                ? `Opens ${localDate.date(body.startDate)}`
                : null,
              body.endDate
                ? `Due ${localDate.date(body.endDate)}`
                : null,
              body.timeLimit != null ? `${body.timeLimit} min` : null,
              body.maxAttempts != null
                ? `${body.maxAttempts} attempt${body.maxAttempts === 1 ? "" : "s"}`
                : null,
              body.passingScore != null ? `Pass ${body.passingScore}%` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          {questions.length} question{questions.length === 1 ? "" : "s"} ·{" "}
          {totalPts} pts
        </p>
        <ol className="flex flex-col gap-2">
          {questions.map((q, i) => (
            <li
              key={i}
              className="rounded-lg border border-border/80 bg-background/50 px-2.5 py-2"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {questionTypeLabel(q.type || "MULTIPLE_CHOICE")}
                </span>
                {editable && onQuestionPointsChange ? (
                  <QuestionPointsInput
                    value={q.points ?? 1}
                    onCommit={(points) => onQuestionPointsChange(i, points)}
                  />
                ) : (
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                    {q.points ?? 1} pts
                  </span>
                )}
              </div>
              {(() => {
                const stem =
                  q.question?.trim() ||
                  (q as { prompt?: string; stem?: string; text?: string })
                    .prompt?.trim() ||
                  (q as { stem?: string }).stem?.trim() ||
                  (q as { text?: string }).text?.trim() ||
                  "";
                if (!stem) {
                  return (
                    <p className="text-sm italic text-muted-foreground">
                      Question text missing — reopen this chat or restore a
                      revision to recover it.
                    </p>
                  );
                }
                return (
                  <p className="text-sm leading-snug text-foreground">{stem}</p>
                );
              })()}
              {q.options && q.options.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {q.options.map((opt, oi) => (
                    <li
                      key={oi}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs leading-snug",
                        q.correctAnswer === opt
                          ? "bg-brand-soft text-ink"
                          : "text-muted-foreground",
                      )}
                    >
                      {opt}
                    </li>
                  ))}
                </ul>
              ) : q.correctAnswer ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Answer: {q.correctAnswer}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (type === "DISCUSSION") {
    return (
      <div className="flex flex-col gap-3 pb-6 text-sm">
        {body.personaName ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Persona
            </p>
            <p className="mt-1 text-foreground">{body.personaName}</p>
          </div>
        ) : null}
        {body.instructions ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Instructions
            </p>
            <p className="mt-1 whitespace-pre-wrap text-foreground/90">
              {body.instructions}
            </p>
          </div>
        ) : null}
        {body.systemPrompt ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tutor prompt
            </p>
            <p className="mt-1 whitespace-pre-wrap text-foreground/90">
              {body.systemPrompt}
            </p>
          </div>
        ) : null}
        {!body.personaName && !body.instructions && !body.systemPrompt ? (
          <p className="text-muted-foreground">No discussion content yet.</p>
        ) : null}
      </div>
    );
  }

  if (type === "INTERACTIVE") {
    const kind = body.interactiveKind;
    const ib = body.interactiveBody ?? {};
    const fillText = typeof ib.text === "string" ? ib.text : "";
    const blanks = Array.isArray(ib.blanks) ? ib.blanks : [];
    const panels = Array.isArray(ib.panels) ? ib.panels : [];
    const sentence = typeof ib.sentence === "string" ? ib.sentence : "";
    const words = Array.isArray(ib.words) ? ib.words : [];

    return (
      <div className="flex flex-col gap-3 text-sm">
        {kind ? (
          <Badge variant="outline" className="w-fit font-normal">
            {kind.replaceAll("_", " ")}
          </Badge>
        ) : null}
        {body.description ? (
          <p className="text-foreground/90">{body.description}</p>
        ) : null}
        {kind === "FILL_BLANKS" ? (
          fillText.trim() ? (
            <div className="space-y-2">
              <MarkedBlankText text={fillText} />
              {blanks.length > 0 ? (
                <ul className="rounded-lg border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                  {blanks.map((blank, i) => {
                    const b = blank as {
                      id?: string;
                      answers?: string[];
                    };
                    const answers = (b.answers ?? []).filter(Boolean);
                    return (
                      <li
                        key={b.id ?? i}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                      >
                        <span className="font-medium text-foreground">
                          Blank {i + 1}
                        </span>
                        <span className="text-muted-foreground/70">
                          ({b.id ?? `b${i + 1}`})
                        </span>
                        <span className="text-foreground">
                          {answers.join(", ") || "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground">
              No fill-in-the-blanks text yet.
            </p>
          )
        ) : null}
        {kind === "DRAG_WORDS" && sentence.trim() ? (
          <div className="space-y-1">
            <MarkedBlankText text={sentence} />
            {words.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Words: {words.map(String).join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
        {kind === "ACCORDION" && panels.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {panels.map((panel, i) => {
              const p = panel as {
                id?: string;
                title?: string;
                body?: string;
              };
              return (
                <li
                  key={p.id ?? i}
                  className="rounded-lg border border-border bg-background/50 px-3 py-2"
                >
                  <p className="text-xs font-medium text-foreground">
                    {p.title ?? `Panel ${i + 1}`}
                  </p>
                  {p.body ? (
                    <p className="mt-1 text-xs text-muted-foreground">{p.body}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Use Preview to try the interactive as students will see it.
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">Nothing to show for this item.</p>
  );
}
