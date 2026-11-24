'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────
 * THINKING — expandable agent trace for authoring chat
 *
 *   Steps      step list with spinner → muted checks
 *   Reasoning  prose that expands, then settles
 *   Search     search-style query + sources
 *   Coding     tool trace: files read, edits, commands
 *
 * Driven by `busy` when provided (real in-flight work);
 * otherwise runs a short demo sequence then settles.
 * ───────────────────────────────────────────────────────── */

const STAGES = [800, 600, 1800, 2600, 1600];

function useSequence(steps: number[], enabled: boolean) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (stage >= steps.length - 1) return;
    const t = setTimeout(() => setStage((s) => s + 1), steps[stage]);
    return () => clearTimeout(t);
  }, [stage, steps, enabled]);
  useEffect(() => {
    if (enabled) setStage(0);
  }, [enabled]);
  return stage;
}

export type ThinkingRow = {
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
};

const VARIANTS: Record<
  string,
  { active: string; done: string; rows: ThinkingRow[]; query?: string }
> = {
  Steps: {
    active: 'Thinking',
    done: 'Thought for a few seconds',
    rows: [
      { primary: 'Reading course materials' },
      { primary: 'Planning modules' },
      { primary: 'Drafting the outline', secondary: 'assignments' },
      { primary: 'Checking structure' },
    ],
  },
  Reasoning: {
    active: 'Thinking',
    done: 'Thought for a few seconds',
    rows: [
      {
        primary:
          'Prioritize materials that match the brief before inventing new topics.',
      },
      {
        primary:
          'Keep module count aligned with the course length and assessment load.',
      },
    ],
  },
  Search: {
    active: 'Searching materials',
    done: 'Searched materials',
    query: 'syllabus + prior quizzes',
    rows: [
      { primary: 'Syllabus', secondary: 'Ready' },
      { primary: 'Lecture notes', secondary: 'Ready' },
      { primary: 'Prior quiz bank', secondary: 'Ready' },
    ],
  },
  Coding: {
    active: 'Running tools',
    done: 'Ran tools',
    rows: [
      { primary: 'Read', secondary: 'outline.json', mono: true },
      {
        primary: 'Edit',
        secondary: 'module-2.md',
        mono: true,
        add: 42,
        del: 8,
      },
      { primary: 'Validate', secondary: 'rubric checks', mono: true },
    ],
  },
};

function SearchDot({ index }: { index: number }) {
  const tones = ['bg-brand', 'bg-ink-muted', 'bg-success'] as const;
  return (
    <span
      className={cn(
        'flex size-3.5 shrink-0 items-center justify-center rounded-full text-paper',
        tones[index % tones.length],
      )}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    </span>
  );
}

export function ThinkingState({
  variant = 'Steps',
  busy,
  onSettled,
  rows,
  active,
  done,
  icon,
  /** Real 0-based index of the in-flight step; drives the spinner + revealed rows. */
  stepIndex,
  inline = false,
  seconds,
  className,
}: {
  variant?: keyof typeof VARIANTS | string;
  /** When set, drives working vs settled from real in-flight work. */
  busy?: boolean;
  onSettled?: () => void;
  rows?: ThinkingRow[];
  active?: string;
  done?: string;
  icon?: ReactNode;
  stepIndex?: number;
  /**
   * Claude-style: while working, one status line that updates in place;
   * the step list stays collapsed unless the user opens it.
   */
  inline?: boolean;
  /** Settled duration for a finished trace (e.g. attached to a message). */
  seconds?: number;
  className?: string;
}) {
  const controlled = busy !== undefined;
  const hasRealTrace = typeof stepIndex === 'number' && Boolean(rows?.length);
  const stage = useSequence(STAGES, !controlled || Boolean(busy));
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAt = useRef<number | null>(null);

  const base = VARIANTS[variant] ?? VARIANTS.Steps;
  const v = {
    ...base,
    rows: rows?.length ? rows : base.rows,
    active: active ?? base.active,
    done: done ?? base.done,
  };

  const working = controlled ? Boolean(busy) : stage < 3;
  const autoExpanded = controlled
    ? working || stage >= 1
    : stage >= 1 && stage < 4;
  const expanded = manualExpanded ?? (inline ? false : working || autoExpanded);

  const currentStep = hasRealTrace
    ? Math.min(Math.max(0, stepIndex!), Math.max(v.rows.length - 1, 0))
    : null;

  const visible = controlled
    ? working
      ? hasRealTrace
        ? Math.min(v.rows.length, (currentStep ?? 0) + 1)
        : Math.min(
            v.rows.length,
            Math.max(1, Math.floor(elapsedSec / 1.6) + 1),
          )
      : v.rows.length
    : stage < 2
      ? 0
      : stage === 2
        ? Math.min(2, v.rows.length)
        : v.rows.length;

  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);
  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [visible, expanded, variant, stage, working, v.rows.length, currentStep]);

  useEffect(() => {
    if (!working) return;
    if (startedAt.current == null) startedAt.current = Date.now();
    const id = window.setInterval(() => {
      if (startedAt.current == null) return;
      setElapsedSec(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
    }, 400);
    return () => window.clearInterval(id);
  }, [working]);

  useEffect(() => {
    if (busy) {
      startedAt.current = Date.now();
      setElapsedSec(0);
      setManualExpanded(null);
    }
  }, [busy]);

  const settledRef = useRef(false);
  useEffect(() => {
    if (working) {
      settledRef.current = false;
      return;
    }
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled?.();
  }, [working, onSettled]);

  const shownSeconds = seconds ?? (controlled && elapsedSec > 0 ? elapsedSec : null);
  const stepCount = rows?.length ?? 0;
  const doneLabel =
    shownSeconds != null
      ? `Thought for ${shownSeconds}s${inline && stepCount > 1 ? ` · ${stepCount} steps` : ''}`
      : v.done;

  return (
    <div
      className={cn('flex w-full max-w-md flex-col', className)}
      style={
        inline
          ? undefined
          : {
              minHeight: working || expanded ? 120 : undefined,
              transition: 'min-height 400ms cubic-bezier(0.23,1,0.32,1)',
            }
      }
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() =>
          setManualExpanded((current) => !(current ?? (working || autoExpanded)))
        }
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-100 hover:bg-surface-sunken"
      >
        {icon ? (
          <span
            className="flex shrink-0 transition-colors duration-200"
            style={{
              color: working ? 'var(--ink-muted)' : 'var(--ink-faint)',
            }}
          >
            {icon}
          </span>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={working ? 'var(--ink-muted)' : 'var(--ink-faint)'}
            aria-hidden
          >
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
          </svg>
        )}
        <span role="status" className="contents">
          {working ? (
            <span
              // Re-keyed per label so each new step fades in where the last one was.
              key={inline ? v.active : undefined}
              className={cn(
                'thinking-shimmer text-[13px] font-medium',
                inline ? 'animate-fade-in truncate' : 'whitespace-nowrap',
              )}
            >
              {v.active}
            </span>
          ) : (
            <span className="animate-fade-in text-[13px] font-medium whitespace-nowrap text-ink-muted">
              {doneLabel}
            </span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-faint)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          opacity: expanded ? 1 : 0,
          transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[5px] pl-4">
            <span
              aria-hidden
              className="absolute left-[3px] w-px bg-rule"
              style={{
                top: -8,
                height: lineHeight ? lineHeight - 2 : 0,
                transition: 'height 500ms cubic-bezier(0.23,1,0.32,1)',
              }}
            />
            <div ref={traceRef} className="flex flex-col gap-1 py-1">
              {v.query ? (
                <div
                  className="flex h-6 items-center gap-2 px-1.5"
                  style={{
                    animation: expanded
                      ? 'thinking-fade-up 300ms cubic-bezier(0.23,1,0.32,1) both'
                      : undefined,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--ink-faint)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="shrink-0"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <span className="text-[12.5px] text-ink-muted">{v.query}</span>
                </div>
              ) : null}
              {v.rows.slice(0, visible).map((row, i) => {
                const stepDone =
                  !working ||
                  (currentStep != null ? i < currentStep : i < visible - 1);
                const content = (
                  <>
                    {variant === 'Search' ? <SearchDot index={i} /> : null}
                    {variant === 'Steps' ? (
                      stepDone ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--ink-faint)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="shrink-0"
                          aria-hidden
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        <span
                          className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-rule border-t-ink-muted"
                          aria-hidden
                        />
                      )
                    ) : null}
                    <span
                      className={cn(
                        'min-w-0 truncate text-[12.5px]',
                        variant === 'Reasoning'
                          ? 'whitespace-normal leading-relaxed text-ink-muted'
                          : 'font-medium text-ink',
                      )}
                    >
                      {row.primary}
                    </span>
                    {row.secondary ? (
                      <span
                        className={cn(
                          'shrink-0 text-[11.5px] text-ink-faint',
                          row.mono && 'font-mono',
                        )}
                      >
                        {row.secondary}
                      </span>
                    ) : null}
                    {row.add !== undefined ? (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums">
                        <span className="text-success">+{row.add}</span>{' '}
                        <span className="text-destructive">−{row.del}</span>
                      </span>
                    ) : null}
                  </>
                );
                const rowClass =
                  'flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left';
                const animation = {
                  animation: `thinking-fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 120}ms both`,
                };

                if (variant === 'Search' && row.href) {
                  return (
                    <a
                      key={`${row.primary}-${i}`}
                      href={row.href}
                      target="_blank"
                      rel="noreferrer"
                      className={`${rowClass} transition-colors duration-150 hover:bg-surface-sunken`}
                      style={animation}
                    >
                      {content}
                    </a>
                  );
                }

                if (variant === 'Coding') {
                  const selected = selectedTool === row.primary;
                  return (
                    <button
                      key={`${row.primary}-${i}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setSelectedTool(selected ? null : row.primary)
                      }
                      className={cn(
                        rowClass,
                        'transition-colors duration-150',
                        selected
                          ? 'bg-surface-sunken'
                          : 'hover:bg-surface-sunken/60',
                      )}
                      style={animation}
                    >
                      {content}
                    </button>
                  );
                }

                return (
                  <div
                    key={`${row.primary}-${i}`}
                    className={rowClass}
                    style={animation}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThinkingState;
