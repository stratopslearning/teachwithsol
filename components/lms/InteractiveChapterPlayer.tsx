'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Check, ChevronDown, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/basePath';
import {
  CHAPTER_QUESTIONS_PER_ATTEMPT,
  pickCheckQuestions,
  type InteractiveChapterBody,
  type InteractiveChapterCheckQuestion,
} from '@/lib/lms/interactiveChapter';
import { cn } from '@/lib/utils';

type SectionProgress = {
  sectionId: string;
  attempts: number;
  passed: boolean;
};

type CheckResult = {
  question: string;
  correct: boolean;
  correctAnswer: string;
  explanation?: string;
};

function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-li:my-0.5 prose-table:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

function stripBankForClient(
  chapter: InteractiveChapterBody,
): InteractiveChapterBody {
  return {
    ...chapter,
    sections: chapter.sections.map((s) => ({
      ...s,
      checkBank: s.checkBank.map((q) => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      })),
    })),
  };
}

export function InteractiveChapterPlayer({
  lessonId,
  title,
  courseTitle,
  chapter: chapterProp,
  initialProgress,
  moduleItemId,
  preview = false,
}: {
  lessonId: string;
  title: string;
  courseTitle?: string;
  chapter: InteractiveChapterBody;
  initialProgress: SectionProgress[];
  moduleItemId?: string | null;
  /** Faculty / student-view preview — no API writes. */
  preview?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const chapter = useMemo(
    () => stripBankForClient(chapterProp),
    [chapterProp],
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState<SectionProgress[]>(initialProgress);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [attemptQs, setAttemptQs] = useState<
    InteractiveChapterCheckQuestion[] | null
  >(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const section = chapter.sections[activeIdx];
  const passedCount = progress.filter((p) => p.passed).length;
  const sectionProg = progress.find((p) => p.sectionId === section?.id);
  const displayAttempt = Math.max(
    1,
    (sectionProg?.attempts ?? 0) + (results ? 0 : 1),
  );
  const progressPct = chapter.sections.length
    ? Math.round((passedCount / chapter.sections.length) * 100)
    : 0;

  useEffect(() => {
    if (!section) return;
    setAttemptQs(
      pickCheckQuestions(section.checkBank, CHAPTER_QUESTIONS_PER_ATTEMPT),
    );
    setAnswers({});
    setResults(null);
    setFeedback(null);
    setError(null);
  }, [section?.id]);

  function goToSection(idx: number) {
    setActiveIdx(idx);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function submitCheck() {
    if (!section || !attemptQs) return;
    const payload: Record<string, string> = {};
    for (const q of attemptQs) {
      const a = answers[q.question];
      if (!a) {
        setError('Choose an answer for both questions.');
        return;
      }
      payload[q.question] = a;
    }

    if (preview) {
      const localResults = attemptQs.map((q) => {
        const selected = payload[q.question] ?? '';
        const correct =
          selected.trim().toLowerCase() ===
          q.correctAnswer.trim().toLowerCase();
        return {
          question: q.question,
          correct,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        };
      });
      const passed = localResults.every((r) => r.correct);
      setResults(localResults);
      setFeedback(
        passed
          ? 'Nice work — section check passed (preview).'
          : 'Not quite — review the feedback and try again.',
      );
      if (passed) {
        setProgress((prev) => {
          const others = prev.filter((p) => p.sectionId !== section.id);
          const existing = prev.find((p) => p.sectionId === section.id);
          return [
            ...others,
            {
              sectionId: section.id,
              attempts: (existing?.attempts ?? 0) + 1,
              passed: true,
            },
          ];
        });
      }
      return;
    }

    setError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/student/lessons/${lessonId}/chapter-check`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId: section.id,
            answers: payload,
            moduleItemId: moduleItemId ?? null,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not check answers');
        return;
      }
      setResults(data.results as CheckResult[]);
      setFeedback(
        data.passed
          ? data.chapterComplete
            ? 'Chapter complete — all section checks submitted.'
            : 'Section check passed. You can move on.'
          : 'Not quite — review the feedback and try a new attempt.',
      );
      setProgress((prev) => {
        const others = prev.filter((p) => p.sectionId !== section.id);
        return [
          ...others,
          {
            sectionId: section.id,
            attempts: data.progress?.attempts ?? (sectionProg?.attempts ?? 0) + 1,
            passed: Boolean(data.progress?.passed || data.passed),
          },
        ];
      });
      startTransition(() => router.refresh());
    } catch {
      setError('Could not check answers');
    }
  }

  function tryAgain() {
    if (!section) return;
    setAttemptQs(
      pickCheckQuestions(section.checkBank, CHAPTER_QUESTIONS_PER_ATTEMPT),
    );
    setAnswers({});
    setResults(null);
    setFeedback(null);
    setError(null);
  }

  if (!section) {
    return (
      <p className="text-sm text-ink-muted">This chapter has no sections yet.</p>
    );
  }

  const drawn =
    attemptQs ??
    pickCheckQuestions(section.checkBank, CHAPTER_QUESTIONS_PER_ATTEMPT);

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            {courseTitle
              ? `${courseTitle} · Interactive chapter`
              : 'Interactive chapter'}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
            {title}
          </h1>
          {chapter.subtitle ? (
            <p className="mt-2 max-w-3xl text-base text-ink-muted">
              {chapter.subtitle}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span>
            {passedCount} of {chapter.sections.length} checks done
          </span>
          <span aria-hidden>·</span>
          <span>Practice only · not graded</span>
          <span aria-hidden>·</span>
          <span>{CHAPTER_QUESTIONS_PER_ATTEMPT} questions per attempt</span>
        </div>

        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Chapter check progress"
        >
          <div
            className="h-full rounded-full bg-brand/70 transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {chapter.learningObjectives?.length ? (
          <details className="group rounded-lg border border-rule/60 bg-surface/40 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-ink marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                Learning objectives
              </span>
            </summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
              {chapter.learningObjectives.map((o) => (
                <li key={o} className="text-ink">
                  {o}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {preview ? (
          <p className="text-xs text-ink-muted">
            Preview mode — checks are not saved.
          </p>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-start">
        <nav
          className="lg:sticky lg:top-20 lg:self-start"
          aria-label="Explore the chapter"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            Sections
          </p>
          <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {chapter.sections.map((s, i) => {
              const done = progress.some(
                (p) => p.sectionId === s.id && p.passed,
              );
              return (
                <li key={s.id} className="shrink-0 lg:w-full">
                  <button
                    type="button"
                    onClick={() => goToSection(i)}
                    className={cn(
                      'flex max-w-[14rem] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors lg:max-w-none lg:w-full',
                      i === activeIdx
                        ? 'bg-surface text-ink ring-1 ring-rule'
                        : 'text-ink-muted hover:bg-surface/70 hover:text-ink',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
                        done
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : i === activeIdx
                            ? 'bg-brand/15 text-ink'
                            : 'bg-muted text-ink-faint',
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-8">
          <article className="space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Section {activeIdx + 1} of {chapter.sections.length}
              </p>
              <h2 className="mt-1 font-display text-2xl text-ink">
                {section.title}
              </h2>
            </div>

            {section.subsections && section.subsections.length > 0 ? (
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
                  onClick={() => setOutlineOpen((o) => !o)}
                >
                  {outlineOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  In this section
                </button>
                {outlineOpen ? (
                  <ul className="mt-2 space-y-1 border-l border-rule/60 pl-3 text-sm text-ink-muted">
                    {section.subsections.map((sub) => (
                      <li key={sub.id}>
                        <a
                          href={`#${sub.id}`}
                          className="hover:text-ink hover:underline"
                        >
                          {sub.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <Markdown>{section.markdown}</Markdown>

            <p>
              <a
                href="#knowledge-check"
                className="text-sm font-medium text-brand hover:underline"
              >
                Go to knowledge check ↓
              </a>
            </p>
          </article>

          <section
            id="knowledge-check"
            className="scroll-mt-24 space-y-4 border-t border-rule/70 pt-8"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-xl text-ink">
                Check your understanding
              </h3>
              <span className="text-xs text-ink-muted">
                Attempt {displayAttempt} · practice
              </span>
            </div>
            <p className="text-sm text-ink-muted">
              Choose one answer for each question. This does not count toward
              your grade.
            </p>

            <ul className="space-y-6">
              {drawn.map((q, qi) => {
                const result = results?.find((r) => r.question === q.question);
                return (
                  <li key={`${q.question}-${qi}`}>
                    <fieldset disabled={Boolean(results) || pending}>
                      <legend className="text-sm font-medium text-ink">
                        {qi + 1}. {q.question}
                      </legend>
                      <div className="mt-3 space-y-2">
                        {q.options.map((opt) => (
                          <label
                            key={opt}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                              answers[q.question] === opt
                                ? 'border-brand/50 bg-brand/5'
                                : 'border-rule/50 hover:border-rule hover:bg-muted/30',
                            )}
                          >
                            <input
                              type="radio"
                              className="mt-1"
                              name={`q-${qi}`}
                              checked={answers[q.question] === opt}
                              onChange={() =>
                                setAnswers((a) => ({
                                  ...a,
                                  [q.question]: opt,
                                }))
                              }
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                      {result ? (
                        <p
                          className={cn(
                            'mt-2 text-sm',
                            result.correct
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-destructive',
                          )}
                          role="status"
                        >
                          {result.correct
                            ? 'Correct'
                            : `Correct answer: ${result.correctAnswer}`}
                          {result.explanation
                            ? ` — ${result.explanation}`
                            : null}
                        </p>
                      ) : null}
                    </fieldset>
                  </li>
                );
              })}
            </ul>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {feedback ? (
              <p className="text-sm text-ink" role="status">
                {feedback}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              {!results ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => void submitCheck()}
                >
                  Check answers
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={tryAgain}>
                  Try again
                </Button>
              )}
            </div>
          </section>

          {activeIdx === chapter.sections.length - 1 &&
          (chapter.wrapUpMarkdown || chapter.capstoneMarkdown) ? (
            <div className="space-y-6 border-t border-rule/70 pt-8">
              {chapter.wrapUpMarkdown ? (
                <article className="space-y-3">
                  <h3 className="font-display text-xl text-ink">
                    Chapter wrap-up
                  </h3>
                  <Markdown>{chapter.wrapUpMarkdown}</Markdown>
                </article>
              ) : null}
              {chapter.capstoneMarkdown ? (
                <article className="space-y-3">
                  <h3 className="font-display text-xl text-ink">
                    Putting it together
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Practice synthesis — not submitted for a grade
                  </p>
                  <Markdown>{chapter.capstoneMarkdown}</Markdown>
                </article>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2 border-t border-rule/50 pt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={activeIdx === 0}
              onClick={() => goToSection(activeIdx - 1)}
            >
              ← Previous
            </Button>
            {activeIdx < chapter.sections.length - 1 ? (
              <Button
                size="sm"
                onClick={() => goToSection(activeIdx + 1)}
              >
                Next section →
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Back to top ↑
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
