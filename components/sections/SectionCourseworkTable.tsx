'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { EmptyState } from '@/components/patterns/EmptyState';
import {
  LocalDateTime,
  TIMESTAMP_CELL_CLASS,
} from '@/components/timezone/LocalDateTime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFilteredSortedPage } from '@/hooks/useFilteredSortedPage';
import { compareDates, compareStringsIgnoreCase } from '@/lib/listSort';
import type {
  SectionDiscussionRow,
  SectionQuizRow,
} from '@/lib/sections/detailData';
import { PageControls } from '@/components/patterns/PageControls';

type CourseworkKind = 'quiz' | 'discussion';
type TypeFilter = 'ALL' | 'QUIZ' | 'DISCUSSION';
type SortMode = 'TITLE' | 'DUE_ASC' | 'DUE_DESC';

type CourseworkRow = {
  key: string;
  kind: CourseworkKind;
  id: string;
  title: string;
  searchBlob: string;
  dueAt: Date | null;
  quiz?: SectionQuizRow;
  discussion?: SectionDiscussionRow;
};

const ROWS_PER_PAGE = 5;

function buildRows(
  quizzes: SectionQuizRow[],
  discussions: SectionDiscussionRow[],
): CourseworkRow[] {
  const quizRows: CourseworkRow[] = quizzes.map((quiz) => ({
    key: `quiz-${quiz.id}`,
    kind: 'quiz',
    id: quiz.id,
    title: quiz.title,
    searchBlob: [
      quiz.title,
      quiz.description ?? '',
      String(quiz.submissionCount),
    ]
      .join(' ')
      .toLowerCase(),
    dueAt: quiz.endDate ? new Date(quiz.endDate) : null,
    quiz,
  }));
  const discussionRows: CourseworkRow[] = discussions.map((d) => ({
    key: `discussion-${d.id}`,
    kind: 'discussion',
    id: d.id,
    title: d.title,
    searchBlob: [d.title, d.personaName, d.relatedQuizTitle ?? '']
      .join(' ')
      .toLowerCase(),
    dueAt: null,
    discussion: d,
  }));
  return [...quizRows, ...discussionRows];
}

function courseworkCompare(a: CourseworkRow, b: CourseworkRow, mode: SortMode) {
  switch (mode) {
    case 'DUE_ASC': {
      if (!a.dueAt && !b.dueAt) {
        return compareStringsIgnoreCase(a.title, b.title);
      }
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return compareDates(a.dueAt, b.dueAt);
    }
    case 'DUE_DESC': {
      if (!a.dueAt && !b.dueAt) {
        return compareStringsIgnoreCase(a.title, b.title);
      }
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return compareDates(b.dueAt, a.dueAt);
    }
    case 'TITLE':
    default:
      return compareStringsIgnoreCase(a.title, b.title);
  }
}

export function SectionCourseworkTable({
  showDiscussionSessions,
  quizzes,
  discussions,
  quizRowActions,
  discussionRowActions,
}: {
  showDiscussionSessions: boolean;
  quizzes: SectionQuizRow[];
  discussions: SectionDiscussionRow[];
  /** Pre-rendered per-id nodes (must not be functions — this is a Client Component). */
  quizRowActions?: Record<string, ReactNode>;
  discussionRowActions?: Record<string, ReactNode>;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('TITLE');
  const quizResultsBase = '/dashboard/professor/quiz';

  const allRows = useMemo(
    () => buildRows(quizzes, discussions),
    [quizzes, discussions],
  );

  const typedRows = useMemo(() => {
    if (typeFilter === 'QUIZ') return allRows.filter((r) => r.kind === 'quiz');
    if (typeFilter === 'DISCUSSION') {
      return allRows.filter((r) => r.kind === 'discussion');
    }
    return allRows;
  }, [allRows, typeFilter]);

  const compareFn = useCallback(
    (a: CourseworkRow, b: CourseworkRow) => courseworkCompare(a, b, sortMode),
    [sortMode],
  );

  const { page, setPage, totalPages, paginated, filteredCount } =
    useFilteredSortedPage({
      rows: typedRows,
      search,
      filterFn: useCallback((row: CourseworkRow, q: string) => {
        if (!q.trim()) return true;
        return row.searchBlob.includes(q.toLowerCase());
      }, []),
      compareFn,
      rowsPerPage: ROWS_PER_PAGE,
    });

  useEffect(() => {
    setPage(1);
  }, [typeFilter, sortMode, setPage]);

  if (allRows.length === 0) {
    return (
      <EmptyState
        eyebrow="Empty"
        title="No assignments yet."
        description="Use Assign existing, or create one from Assignments / Authoring."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <p className="text-sm text-ink-muted">
          Showing {paginated.length} of {filteredCount}
          {filteredCount !== allRows.length ? ` (filtered from ${allRows.length})` : ''}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as TypeFilter)}
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="QUIZ">Quiz</SelectItem>
              <SelectItem value="DISCUSSION">Discussion</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sortMode}
            onValueChange={(v) => setSortMode(v as SortMode)}
          >
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TITLE">Title A–Z</SelectItem>
              <SelectItem value="DUE_ASC">Due (soonest)</SelectItem>
              <SelectItem value="DUE_DESC">Due (latest)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="search"
            placeholder="Search assignments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-56"
          />
        </div>
      </div>

      <div className="paper paper-shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Assignment</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-ink-muted py-8"
                >
                  No matches.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((row) => {
                if (row.kind === 'quiz' && row.quiz) {
                  const quiz = row.quiz;
                  return (
                    <TableRow key={row.key}>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          Quiz
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-ink">
                            {quiz.title}
                          </span>
                          {quiz.description ? (
                            <span className="text-xs text-ink-faint line-clamp-1">
                              {quiz.description}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell
                        className={`text-sm text-ink-muted ${TIMESTAMP_CELL_CLASS}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span>
                            {quiz.endDate ? (
                              <>
                                Due <LocalDateTime value={quiz.endDate} />
                              </>
                            ) : (
                              'No due date'
                            )}
                          </span>
                          <span className="tnum text-xs text-ink-faint">
                            {quiz.submissionCount} submission
                            {quiz.submissionCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              href={`${quizResultsBase}/${quiz.id}/results`}
                            >
                              Results
                            </Link>
                          </Button>
                          {quizRowActions?.[quiz.id]}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const d = row.discussion!;
                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        Discussion
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-ink">
                      {d.title}
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted">
                      <div className="flex flex-col gap-0.5">
                        <span>{d.personaName}</span>
                        {d.relatedQuizTitle ? (
                          <span className="text-xs text-ink-faint">
                            Linked quiz · {d.relatedQuizTitle}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        {showDiscussionSessions ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              href={`/dashboard/professor/discussions/${d.id}`}
                            >
                              Sessions
                            </Link>
                          </Button>
                        ) : null}
                        {discussionRowActions?.[d.id]}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PageControls page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
