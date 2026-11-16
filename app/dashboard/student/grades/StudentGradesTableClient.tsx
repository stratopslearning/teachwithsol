"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Layers,
  XCircle,
} from "@/components/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/patterns/EmptyState";
import {
  LocalDateTime,
  TIMESTAMP_CELL_CLASS,
} from "@/components/timezone/LocalDateTime";
import { cn } from "@/lib/utils";
import { PassFailBadge } from "@/components/status/badges";

type AttemptRow = {
  id: string;
  quizId: string;
  sectionId: string;
  sectionName: string;
  quizTitle: string;
  courseTitle: string | null;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  sectionArchived?: boolean;
};

type QuizGroup = {
  quizId: string;
  quizTitle: string;
  attempts: AttemptRow[];
  bestAttempt: AttemptRow | null;
};

type SectionGroup = {
  sectionId: string;
  sectionName: string;
  courseTitle: string | null;
  archived: boolean;
  quizzes: QuizGroup[];
  attemptCount: number;
  quizCount: number;
};

function attemptScorePct(a: AttemptRow): number {
  if (a.percentage != null) return a.percentage;
  if (a.maxScore && a.maxScore > 0) {
    return Math.round(((a.score ?? 0) / a.maxScore) * 100);
  }
  return 0;
}

function pickBestAttempt(attempts: AttemptRow[]): AttemptRow | null {
  const submitted = attempts.filter((a) => a.submittedAt);
  if (!submitted.length) return attempts[0] ?? null;
  return submitted.reduce((best, current) =>
    attemptScorePct(current) >= attemptScorePct(best) ? current : best,
  );
}

function buildSectionGroups(attempts: AttemptRow[]): SectionGroup[] {
  const bySection = new Map<string, AttemptRow[]>();
  for (const attempt of attempts) {
    const list = bySection.get(attempt.sectionId) ?? [];
    list.push(attempt);
    bySection.set(attempt.sectionId, list);
  }

  return Array.from(bySection.entries())
    .map(([, sectionAttempts]) => {
      const sample = sectionAttempts[0];
      const byQuiz = new Map<string, AttemptRow[]>();
      for (const attempt of sectionAttempts) {
        const list = byQuiz.get(attempt.quizId) ?? [];
        list.push(attempt);
        byQuiz.set(attempt.quizId, list);
      }

      const quizzes: QuizGroup[] = Array.from(byQuiz.entries())
        .map(([, quizAttempts]) => {
          const sorted = [...quizAttempts].sort((a, b) => {
            const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
            const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
            return tb - ta;
          });
          return {
            quizId: sorted[0].quizId,
            quizTitle: sorted[0].quizTitle,
            attempts: sorted,
            bestAttempt: pickBestAttempt(sorted),
          };
        })
        .sort((a, b) => a.quizTitle.localeCompare(b.quizTitle));

      return {
        sectionId: sample.sectionId,
        sectionName: sample.sectionName,
        courseTitle: sample.courseTitle,
        archived: Boolean(sample.sectionArchived),
        quizzes,
        attemptCount: sectionAttempts.length,
        quizCount: quizzes.length,
      };
    })
    .sort((a, b) => a.sectionName.localeCompare(b.sectionName));
}

function formatScore(a: AttemptRow): string {
  if (a.maxScore != null) return `${a.score ?? 0} / ${a.maxScore}`;
  if (a.percentage != null) return `${a.percentage}%`;
  return "-";
}

function StatusBadge({ passed }: { passed: boolean | null }) {
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-success">
        <CheckCircle2 className="h-4 w-4" />
        <PassFailBadge passed />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-danger">
      <XCircle className="h-4 w-4" />
      <PassFailBadge passed={false} />
    </span>
  );
}

function ReviewButton({ attempt }: { attempt: AttemptRow }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/quiz/${attempt.quizId}/review?attemptId=${attempt.id}`}>
        Review
      </Link>
    </Button>
  );
}

export default function StudentGradesTableClient({
  attempts,
  initialSectionId,
}: {
  attempts: AttemptRow[];
  initialSectionId?: string;
}) {
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>(
    initialSectionId && attempts.some((a) => a.sectionId === initialSectionId)
      ? initialSectionId
      : "ALL",
  );

  const sections = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of attempts) {
      if (!seen.has(a.sectionId)) seen.set(a.sectionId, a.sectionName);
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [attempts]);

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attempts.filter((a) => {
      const matchesSection =
        sectionFilter === "ALL" || a.sectionId === sectionFilter;
      const matchesSearch =
        !q ||
        a.quizTitle.toLowerCase().includes(q) ||
        a.sectionName.toLowerCase().includes(q) ||
        (a.courseTitle?.toLowerCase() || "").includes(q);
      return matchesSection && matchesSearch;
    });
  }, [attempts, search, sectionFilter]);

  const sectionGroups = useMemo(
    () => buildSectionGroups(filteredAttempts),
    [filteredAttempts],
  );

  const totalQuizzes = sectionGroups.reduce((n, s) => n + s.quizCount, 0);
  const totalAttempts = filteredAttempts.length;

  if (attempts.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        eyebrow="Empty"
        title="No attempts yet."
        description="Your grades will appear here after you submit your first quiz."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="md:w-56">
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All sections</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          type="search"
          placeholder="Search by quiz, section, or course…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
      </div>

      {sectionGroups.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No matching grades."
          description="Try a different search or section filter."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              {
                key: "sections",
                label: `${sectionGroups.length} section${sectionGroups.length === 1 ? "" : "s"}`,
              },
              {
                key: "quizzes",
                label: `${totalQuizzes} quiz${totalQuizzes === 1 ? "" : "zes"}`,
              },
              {
                key: "attempts",
                label: `${totalAttempts} attempt${totalAttempts === 1 ? "" : "s"}`,
              },
            ].map(({ key, label }) => (
              <Badge key={key} variant="outline">
                {label}
              </Badge>
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {sectionGroups.map((section) => (
              <SectionGradebook
                key={section.sectionId}
                section={section}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SectionGradebook({ section }: { section: SectionGroup }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="paper paper-shadow overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-surface-sunken/40 transition-colors"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <div className="font-display text-lg text-ink leading-tight">
                  {section.sectionName}
                </div>
                {section.courseTitle ? (
                  <div className="mt-0.5 text-sm text-ink-muted">
                    {section.courseTitle}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {section.archived ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : null}
                  <Badge variant="info">
                    {section.quizCount} quiz
                    {section.quizCount === 1 ? "" : "zes"}
                  </Badge>
                  <Badge variant="outline">
                    {section.attemptCount} attempt
                    {section.attemptCount === 1 ? "" : "s"}
                  </Badge>
                </div>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "mt-1 h-5 w-5 shrink-0 text-ink-muted transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-rule overflow-x-auto">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Quiz / attempt</TableHead>
                  <TableHead className="min-w-[13rem]">Submitted</TableHead>
                  <TableHead className="tnum">Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="sticky right-0 z-10 border-l border-rule bg-surface-sunken/95 px-3 text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.quizzes.flatMap((quiz) => {
                  const multi = quiz.attempts.length > 1;

                  if (!multi) {
                    const attempt = quiz.attempts[0];
                    if (!attempt) return [];
                    return [
                      <TableRow key={quiz.quizId}>
                        <TableCell className="font-medium align-top">
                          {quiz.quizTitle}
                        </TableCell>
                        <TableCell className={`text-sm text-ink-muted ${TIMESTAMP_CELL_CLASS}`}>
                          {attempt.submittedAt ? (
                            <LocalDateTime stacked value={attempt.submittedAt} />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="tnum align-top">
                          {formatScore(attempt)}
                        </TableCell>
                        <TableCell className="align-top">
                          <StatusBadge passed={attempt.passed} />
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 border-l border-rule bg-paper px-3 text-right align-top">
                          <div className="flex min-w-max items-center justify-end">
                            <ReviewButton attempt={attempt} />
                          </div>
                        </TableCell>
                      </TableRow>,
                    ];
                  }

                  const best = quiz.bestAttempt;

                  return [
                    <TableRow
                      key={`${quiz.quizId}-summary`}
                      className="bg-surface-sunken/50"
                    >
                      <TableCell colSpan={3} className="align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-ink">
                            {quiz.quizTitle}
                          </span>
                          <span className="text-xs text-ink-faint">
                            {quiz.attempts.length} attempts
                            {best ? ` · best ${formatScore(best)}` : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {best ? <StatusBadge passed={best.passed} /> : "-"}
                      </TableCell>
                      <TableCell className="sticky right-0 z-10 border-l border-rule bg-surface-sunken/95 px-3 text-right align-top">
                        {best ? (
                          <div className="flex min-w-max items-center justify-end">
                            <ReviewButton attempt={best} />
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>,
                    ...quiz.attempts.map((attempt, idx) => (
                      <TableRow key={attempt.id} className="text-sm">
                        <TableCell className="align-top pl-8 border-l-2 border-brand-soft/60">
                          <span className="text-ink-muted">
                            Attempt {quiz.attempts.length - idx}
                          </span>
                        </TableCell>
                        <TableCell className={`text-ink-muted ${TIMESTAMP_CELL_CLASS}`}>
                          {attempt.submittedAt ? (
                            <LocalDateTime stacked value={attempt.submittedAt} />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="tnum align-top">
                          {formatScore(attempt)}
                        </TableCell>
                        <TableCell className="align-top">
                          <StatusBadge passed={attempt.passed} />
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 border-l border-rule bg-paper px-3 text-right align-top">
                          <div className="flex min-w-max items-center justify-end">
                            <ReviewButton attempt={attempt} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )),
                  ];
                })}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
