'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from '@/components/icons';

import { appPath } from '@/lib/basePath';
import {
  chapterDisplayIndexMap,
  isTeachableTopLevelChapter,
  isTopLevelChapter,
} from '@/lib/books/hierarchy';
import { bookHref } from '@/lib/books/toc';
import { cn } from '@/lib/utils';

export type BookContentsItem = {
  id: string;
  title: string;
  parentId: string | null;
  level?: number | null;
  partTitle?: string | null;
  position?: number;
};

type TocNode = BookContentsItem & { children: BookContentsItem[] };

/** Teachable top-level chapters only (no Cover / Title Page / Copyright / TOC). */
function buildTocTree(
  chapters: BookContentsItem[],
  bookTitle: string,
): TocNode[] {
  const byParent = new Map<string | null, BookContentsItem[]>();
  for (const ch of chapters) {
    const key = ch.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(ch);
    byParent.set(key, list);
  }
  const roots = (
    byParent.get(null) ?? chapters.filter((c) => isTopLevelChapter(c))
  ).filter((r) => isTeachableTopLevelChapter(r, bookTitle));
  return roots.map((r) => ({
    ...r,
    children: byParent.get(r.id) ?? [],
  }));
}

/** Flat list for plain variant: teachable roots + their descendants only. */
function teachableFlatList(
  chapters: BookContentsItem[],
  bookTitle: string,
): BookContentsItem[] {
  const tree = buildTocTree(chapters, bookTitle);
  const out: BookContentsItem[] = [];
  for (const node of tree) {
    out.push(node);
    out.push(...node.children);
  }
  return out;
}

export function BookContentsNav({
  bookId,
  bookTitle,
  chapters,
  activeChapterId,
  sectionId,
  className,
  onNavigate,
  variant = 'reader',
  audience = 'student',
}: {
  bookId: string;
  bookTitle: string;
  chapters: BookContentsItem[];
  activeChapterId?: string | null;
  sectionId?: string | null;
  className?: string;
  onNavigate?: () => void;
  /** `reader` = Pressbooks-style blocks; `plain` = compact list */
  variant?: 'reader' | 'plain';
  audience?: 'student' | 'professor';
}) {
  const displayIndex = useMemo(
    () => chapterDisplayIndexMap(chapters, bookTitle),
    [chapters, bookTitle],
  );
  const tree = useMemo(
    () => buildTocTree(chapters, bookTitle),
    [chapters, bookTitle],
  );
  const plainChapters = useMemo(
    () => teachableFlatList(chapters, bookTitle),
    [chapters, bookTitle],
  );

  const activeParentId = useMemo(() => {
    const active = chapters.find((c) => c.id === activeChapterId);
    if (!active) return null;
    if (active.parentId) return active.parentId;
    return active.id;
  }, [chapters, activeChapterId]);

  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!activeParentId) return;
    setOpenIds((prev) => {
      if (prev.has(activeParentId)) return prev;
      const next = new Set(prev);
      next.add(activeParentId);
      return next;
    });
  }, [activeParentId]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (variant === 'plain') {
    return (
      <nav className={cn('min-h-0', className)} aria-label="Book contents">
        <ul className="space-y-0.5">
          {plainChapters.map((ch) => {
            const level = ch.level ?? 0;
            const isActive = ch.id === activeChapterId;
            const index = displayIndex.get(ch.id);
            return (
              <li key={ch.id}>
                <Link
                  href={appPath(
                    bookHref(bookId, {
                      sectionId,
                      chapterId: ch.id,
                      audience,
                    }),
                  )}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-baseline gap-2 rounded-lg py-1.5 text-sm transition-colors',
                    level > 0 ? 'pl-5 pr-2' : 'px-2',
                    isActive
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  <span className="w-6 shrink-0 tabular-nums text-xs text-muted-foreground">
                    {level > 0 ? '↳' : index != null ? `${index}.` : '·'}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{ch.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav className={cn('min-h-0', className)} aria-label="Book contents">
      <Link
        href={appPath(bookHref(bookId, { sectionId, audience }))}
        onClick={onNavigate}
        className="mb-3 block px-1 text-sm font-medium text-ink underline-offset-2 hover:underline"
      >
        {bookTitle}
      </Link>

      <ul className="flex flex-col gap-1.5">
        {tree.map((node) => {
          const hasChildren = node.children.length > 0;
          const isOpen = openIds.has(node.id);
          const isActive = node.id === activeChapterId;
          const index = displayIndex.get(node.id);
          const label =
            index != null
              ? `${romanOrArabic(index)}. ${node.title}`
              : node.title;

          return (
            <li key={node.id}>
              <div className="flex items-stretch gap-1">
                <Link
                  href={appPath(
                    bookHref(bookId, {
                      sectionId,
                      chapterId: node.id,
                      audience,
                    }),
                  )}
                  onClick={onNavigate}
                  className={cn(
                    'min-w-0 flex-1 rounded-md px-2.5 py-2 text-sm leading-snug transition-colors',
                    isActive
                      ? 'bg-brand-soft font-medium text-ink'
                      : 'bg-surface-sunken/80 text-ink hover:bg-surface-sunken',
                  )}
                >
                  {label}
                </Link>
                {hasChildren ? (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                    onClick={() => toggle(node.id)}
                    className="flex h-auto w-9 shrink-0 items-center justify-center rounded-md border border-rule bg-surface text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
                  >
                    {isOpen ? (
                      <Minus className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : null}
              </div>

              {hasChildren && isOpen ? (
                <ul className="mt-1 overflow-hidden rounded-md border border-rule/80 bg-surface">
                  {node.children.map((child, i) => {
                    const childActive = child.id === activeChapterId;
                    return (
                      <li
                        key={child.id}
                        className={cn(
                          i > 0 && 'border-t border-rule/70',
                        )}
                      >
                        <Link
                          href={appPath(
                            bookHref(bookId, {
                              sectionId,
                              chapterId: child.id,
                              audience,
                            }),
                          )}
                          onClick={onNavigate}
                          className={cn(
                            'block px-3 py-2 text-sm transition-colors',
                            childActive
                              ? 'bg-brand-soft/70 font-medium text-ink'
                              : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                          )}
                        >
                          {child.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Pressbooks-style Roman numerals for top-level chapter labels. */
function romanOrArabic(n: number): string {
  const numerals: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let remaining = Math.max(0, Math.floor(n));
  let out = '';
  for (const [value, glyph] of numerals) {
    while (remaining >= value) {
      out += glyph;
      remaining -= value;
    }
  }
  return out || String(n);
}
