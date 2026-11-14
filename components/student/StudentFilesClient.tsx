'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { BookOpen, FileText, Search } from '@/components/icons';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { StudentBookListItem } from '@/lib/books/student';
import { cn } from '@/lib/utils';

export function StudentFilesClient({
  books,
}: {
  books: StudentBookListItem[];
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.courseTitle.toLowerCase().includes(q),
    );
  }, [books, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Files</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Books and course materials released to this section
            {books.length > 0
              ? ` · ${books.length} item${books.length === 1 ? '' : 's'}`
              : ''}
            .
          </p>
        </div>
      </div>

      {books.length > 0 ? (
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files"
            className="h-10 pl-9"
            aria-label="Search files"
          />
        </div>
      ) : null}

      {books.length === 0 ? (
        <EmptyState
          icon={<FolderGlyph />}
          eyebrow="Files"
          title="Nothing released yet"
          description="When your instructor releases a book or file to this section, it will show up here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="bare"
          title="No matches"
          description="Try a different search."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule/80 bg-surface">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-rule/70 bg-muted/30 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]">
            <span>Name</span>
            <span className="hidden sm:block">Type</span>
            <span className="hidden sm:block">Chapters</span>
            <span className="sr-only sm:not-sr-only sm:text-right">Open</span>
          </div>
          <ul className="divide-y divide-rule/60">
            {filtered.map((book) => (
              <li key={book.id}>
                <Link
                  href={book.href}
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors',
                    'hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none',
                    'sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]',
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rule/80 bg-muted/40 text-ink-muted">
                      <BookOpen className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {book.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {book.courseTitle}
                        <span className="sm:hidden">
                          {' · '}
                          {book.chapterCount} chapter
                          {book.chapterCount === 1 ? '' : 's'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <Badge
                      variant="secondary"
                      className="font-mono text-[0.65rem]"
                    >
                      Book
                    </Badge>
                  </div>
                  <p className="hidden tabular-nums text-sm text-ink-muted sm:block">
                    {book.chapterCount}
                  </p>
                  <span className="justify-self-end rounded-md border border-rule/80 px-2.5 py-1 text-xs font-medium text-ink">
                    Open
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FolderGlyph() {
  return <FileText className="h-5 w-5" aria-hidden />;
}
