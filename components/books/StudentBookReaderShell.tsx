'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X } from '@/components/icons';

import {
  BookContentsNav,
  type BookContentsItem,
} from '@/components/books/BookContentsNav';
import { AppShell } from '@/components/layout/AppShell';
import { appPath, withBasePath } from '@/lib/basePath';
import { bookHref } from '@/lib/books/toc';
import { cn } from '@/lib/utils';

type NavUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  paid?: boolean | null;
};

function truncate(t: string, n = 40) {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * Pressbooks-style chrome: CONTENTS rail, dark title bar, reading column, bottom nav.
 */
export function StudentBookReaderShell({
  user,
  book,
  chapters,
  section,
  activeChapterId = null,
  children,
  prev = null,
  next = null,
  audience = 'student',
  backHref: backHrefOverride = null,
}: {
  user: NavUser;
  book: { id: string; title: string };
  chapters: BookContentsItem[];
  section: { id: string; name: string } | null;
  activeChapterId?: string | null;
  children: ReactNode;
  prev?: { id: string; title: string } | null;
  next?: { id: string; title: string } | null;
  audience?: 'student' | 'professor';
  backHref?: string | null;
}) {
  const [tocOpen, setTocOpen] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setTocOpen(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const bookTocHref = withBasePath(
    bookHref(book.id, { sectionId: section?.id, audience }),
  );
  const backHref =
    backHrefOverride ??
    (section
      ? withBasePath(`/dashboard/student/sections/${section.id}/books`)
      : bookTocHref);

  return (
    <AppShell
      role={audience === 'professor' ? 'professor' : 'student'}
      active={audience === 'professor' ? 'knowledge' : 'sections'}
      user={user}
      topbarTitle={book.title}
      maxWidth="full"
      className="!px-0 !py-0 sm:!px-0 md:!px-0 md:!py-0 xl:!px-0 xl:!py-0 2xl:!px-0"
    >
      <div className="flex h-[calc(100dvh-3.5rem)] min-h-[32rem] flex-col bg-paper">
        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              'flex shrink-0 flex-col border-r border-rule bg-surface transition-[width] duration-200',
              tocOpen
                ? 'w-[min(100%,18.5rem)] max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:shadow-lg'
                : 'w-0 overflow-hidden border-r-0',
            )}
          >
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 bg-ink px-3 text-paper">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]"
                onClick={() => setTocOpen(false)}
                aria-expanded={tocOpen}
              >
                Contents
                <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden />
              </button>
              <button
                type="button"
                className="rounded p-1 text-paper/70 hover:bg-white/10 hover:text-paper lg:hidden"
                aria-label="Close contents"
                onClick={() => setTocOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-8">
              <BookContentsNav
                bookId={book.id}
                bookTitle={book.title}
                chapters={chapters}
                activeChapterId={activeChapterId}
                sectionId={section?.id}
                audience={audience}
                onNavigate={() => {
                  if (window.matchMedia('(max-width: 1023px)').matches) {
                    setTocOpen(false);
                  }
                }}
              />
              <Link
                href={backHref}
                className="mt-4 block px-1 text-xs text-ink-faint hover:text-ink"
              >
                {audience === 'professor'
                  ? backHrefOverride
                    ? '← Back to materials'
                    : '← Back to book'
                  : '← Back to books'}
              </Link>
            </div>
          </aside>

          {tocOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
              aria-label="Dismiss contents"
              onClick={() => setTocOpen(false)}
            />
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-11 shrink-0 items-center gap-3 bg-ink px-3 text-paper sm:px-5">
              {!tocOpen ? (
                <button
                  type="button"
                  onClick={() => setTocOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-white/15"
                >
                  Contents
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : (
                <span
                  className="hidden w-[5.5rem] shrink-0 sm:block"
                  aria-hidden
                />
              )}
              <p className="min-w-0 flex-1 truncate text-center text-xs font-medium uppercase tracking-[0.08em] text-paper/90 sm:text-sm">
                {book.title}
              </p>
              <span
                className="hidden w-[5.5rem] shrink-0 sm:block"
                aria-hidden
              />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface">
              {children}
            </div>

            <footer className="z-20 flex h-12 shrink-0 items-center justify-between gap-3 border-t border-ink/20 bg-ink px-3 text-paper sm:px-5">
              {prev ? (
                <Link
                  href={appPath(
                    bookHref(book.id, {
                      sectionId: section?.id,
                      chapterId: prev.id,
                      audience,
                    }),
                  )}
                  className="inline-flex min-w-0 max-w-[46%] items-center gap-1.5 text-sm text-paper/90 transition-colors hover:text-paper"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">
                    Previous: {truncate(prev.title)}
                  </span>
                </Link>
              ) : (
                <span className="text-sm text-paper/50" aria-hidden>
                  {' '}
                </span>
              )}
              {next ? (
                <Link
                  href={appPath(
                    bookHref(book.id, {
                      sectionId: section?.id,
                      chapterId: next.id,
                      audience,
                    }),
                  )}
                  className="inline-flex min-w-0 max-w-[46%] items-center justify-end gap-1.5 text-sm text-paper/90 transition-colors hover:text-paper"
                >
                  <span className="truncate text-right">
                    Next: {truncate(next.title)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              ) : (
                <span className="text-sm text-paper/50">End of book</span>
              )}
            </footer>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
