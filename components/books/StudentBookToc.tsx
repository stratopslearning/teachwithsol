'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import {
  type BookContentsItem,
} from '@/components/books/BookContentsNav';
import { BookResumeButton } from '@/components/books/BookResumeButton';
import { StudentBookReaderShell } from '@/components/books/StudentBookReaderShell';
import { appPath, withBasePath } from '@/lib/basePath';
import {
  isMetaTocChapter,
  isTeachableTopLevelChapter,
} from '@/lib/books/hierarchy';
import { bookHref } from '@/lib/books/toc';

type NavUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  paid?: boolean | null;
};

/** First readable leaf/chapter for “Next” from the book home. */
function firstReadableChapter(
  chapters: BookContentsItem[],
  bookTitle: string,
): { id: string; title: string } | null {
  const roots = chapters.filter((c) =>
    isTeachableTopLevelChapter(c, bookTitle),
  );
  for (const root of roots) {
    const children = chapters.filter(
      (c) => c.parentId === root.id && !isMetaTocChapter(c, bookTitle),
    );
    if (children[0]) {
      return { id: children[0].id, title: children[0].title };
    }
    return { id: root.id, title: root.title };
  }
  const fallback = chapters.find((c) => !isMetaTocChapter(c, bookTitle));
  return fallback ? { id: fallback.id, title: fallback.title } : null;
}

export function StudentBookToc({
  user,
  book,
  chapters,
  section,
  chapterCount,
  audience = 'student',
  backHref = null,
}: {
  user: NavUser;
  book: { id: string; title: string };
  chapters: BookContentsItem[];
  section: { id: string; name: string } | null;
  chapterCount: number;
  audience?: 'student' | 'professor';
  backHref?: string | null;
}) {
  const next = useMemo(
    () => firstReadableChapter(chapters, book.title),
    [chapters, book.title],
  );

  const sectionBooksHref =
    audience === 'student' && section
      ? withBasePath(`/dashboard/student/sections/${section.id}/books`)
      : null;

  return (
    <StudentBookReaderShell
      user={user}
      book={book}
      chapters={chapters}
      section={section}
      activeChapterId={null}
      next={next}
      audience={audience}
      backHref={backHref}
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-10 sm:py-10 md:px-12">
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          {book.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          {chapterCount} chapter{chapterCount === 1 ? '' : 's'}
          {chapters.some((c) => c.parentId) ? ' with sub-chapters' : ''}.
          {audience === 'professor'
            ? ' Preview how students will see this book.'
            : ' Choose a section from Contents, or continue where you left off.'}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <BookResumeButton
            bookId={book.id}
            sectionId={section?.id}
            chapters={chapters}
            audience={audience}
          />
          {next ? (
            <Link
              href={appPath(
                bookHref(book.id, {
                  sectionId: section?.id,
                  chapterId: next.id,
                  audience,
                }),
              )}
              className="text-sm font-medium text-brand hover:underline"
            >
              Start: {next.title}
            </Link>
          ) : null}
        </div>
        {sectionBooksHref ? (
          <Link
            href={sectionBooksHref}
            className="mt-10 inline-block text-xs text-ink-faint hover:text-ink"
          >
            ← All section books
          </Link>
        ) : null}
      </div>
    </StudentBookReaderShell>
  );
}
