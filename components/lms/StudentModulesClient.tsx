'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Lock,
  MessageSquare,
  Puzzle,
} from '@/components/icons';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Badge } from '@/components/ui/badge';
import { withBasePath } from '@/lib/basePath';
import { cn } from '@/lib/utils';

type Item = {
  id: string;
  title: string;
  type: string;
  isHeader: boolean;
  quizId: string | null;
  lessonId: string | null;
  chatbotId: string | null;
  interactiveId: string | null;
  pageId: string | null;
  externalUrl: string | null;
  completionRequirement: { type: string; minPercent?: number } | null;
  completed?: boolean;
};

type ModuleRow = {
  id: string;
  title: string;
  locked?: boolean;
  lockReason?: string | null;
  prerequisiteModuleIds?: string[];
  items: Item[];
};

function itemHref(sectionId: string, item: Item): string | null {
  if (item.externalUrl) return item.externalUrl;
  if (item.quizId) {
    return withBasePath(`/dashboard/student/quiz/${item.quizId}`);
  }
  if (item.lessonId) {
    return withBasePath(`/dashboard/student/lessons/${item.lessonId}`);
  }
  if (item.chatbotId) {
    return withBasePath(`/chatbot/${item.chatbotId}`);
  }
  if (item.interactiveId) {
    return withBasePath(`/interactive/${item.interactiveId}`);
  }
  if (item.pageId) {
    return withBasePath(
      `/dashboard/student/sections/${sectionId}/pages/${item.pageId}`,
    );
  }
  return null;
}

function ItemIcon({ type }: { type: string }) {
  const className = 'h-4 w-4';
  if (type === 'LESSON') return <BookOpen className={className} aria-hidden />;
  if (type === 'QUIZ') return <ClipboardList className={className} aria-hidden />;
  if (type === 'DISCUSSION' || type === 'TUTOR') {
    return <MessageSquare className={className} aria-hidden />;
  }
  if (type === 'INTERACTIVE') return <Puzzle className={className} aria-hidden />;
  return <FileText className={className} aria-hidden />;
}

function typeLabel(type: string): string | null {
  if (type === 'LESSON') return 'Lesson';
  if (type === 'QUIZ') return 'Quiz';
  if (type === 'INTERACTIVE') return 'Interactive';
  if (type === 'DISCUSSION' || type === 'TUTOR') return 'Discussion';
  return null;
}

function reqHint(item: Item): string | null {
  const r = item.completionRequirement;
  if (!r) return null;
  if (item.completed) {
    if (r.type === 'view') return 'Viewed';
    if (r.type === 'submit') {
      return item.type === 'LESSON' ? 'Section checks complete' : 'Submitted';
    }
    return 'Completed';
  }
  if (r.type === 'view') return 'Must view';
  if (r.type === 'submit') {
    return item.type === 'LESSON' ? 'Complete section checks' : 'Must submit';
  }
  if (r.type === 'score_at_least') {
    return `Score at least ${r.minPercent ?? 70}%`;
  }
  return null;
}

export function StudentModulesClient({
  sectionId,
  modules,
}: {
  sectionId: string;
  modules: ModuleRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mod of modules) m.set(mod.id, mod.title);
    return m;
  }, [modules]);

  async function markViewed(itemId: string) {
    await fetch(`/api/lms/module-items/${itemId}/complete`, {
      method: 'POST',
    });
    startTransition(() => router.refresh());
  }

  if (modules.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-5 w-5" />}
        eyebrow="Modules"
        title="No modules yet"
        description="When your instructor publishes course modules, they will appear here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl text-ink">Modules</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Work through each week in order. Progress updates when you complete
          the linked activity.
        </p>
      </div>

      <ul className="space-y-3">
        {modules.map((m) => {
          const isCollapsed = collapsed[m.id] ?? false;
          const prereqNames = (m.prerequisiteModuleIds ?? [])
            .map((id) => titleById.get(id))
            .filter(Boolean) as string[];
          const required = m.items.filter(
            (i) => !i.isHeader && i.completionRequirement,
          );
          const doneRequired = required.filter((i) => i.completed).length;
          const moduleComplete =
            !m.locked &&
            required.length > 0 &&
            doneRequired === required.length;
          const contentItems = m.items.filter((i) => !i.isHeader);

          return (
            <li
              key={m.id}
              className="overflow-hidden rounded-xl border border-rule/80 bg-surface"
            >
              <div className="flex items-center gap-2 bg-muted/35 px-3 py-3">
                <button
                  type="button"
                  className="rounded p-0.5 text-ink-muted hover:text-ink"
                  onClick={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [m.id]: !prev[m.id],
                    }))
                  }
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">
                    {m.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                    {prereqNames.length > 0 ? (
                      <span>Prerequisites: {prereqNames.join(', ')}</span>
                    ) : null}
                    {required.length > 0 ? (
                      <span>
                        Progress {doneRequired}/{required.length}
                      </span>
                    ) : contentItems.length > 0 ? (
                      <span>
                        {contentItems.length} item
                        {contentItems.length === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {m.locked && m.lockReason ? (
                      <span>{m.lockReason}</span>
                    ) : null}
                  </div>
                </div>
                {m.locked ? (
                  <Lock className="h-4 w-4 shrink-0 text-ink-faint" />
                ) : moduleComplete ? (
                  <Check className="h-4 w-4 shrink-0 text-success" />
                ) : null}
              </div>

              {!isCollapsed ? (
                m.locked ? (
                  <p className="px-4 py-4 text-sm text-ink-muted">
                    This module is locked
                    {m.lockReason ? ` — ${m.lockReason}` : ''}.
                  </p>
                ) : contentItems.length === 0 &&
                  m.items.every((i) => i.isHeader) ? (
                  <p className="px-4 py-4 text-sm text-ink-muted">
                    No items in this module yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-rule/50">
                    {m.items.map((item) => {
                      if (item.isHeader) {
                        return (
                          <li
                            key={item.id}
                            className="bg-muted/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                          >
                            {item.title}
                          </li>
                        );
                      }
                      const href = itemHref(sectionId, item);
                      const hint = reqHint(item);
                      const kind = typeLabel(item.type);
                      const row = (
                        <>
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rule/70 bg-muted/30 text-ink-muted">
                            <ItemIcon type={item.type} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {kind ? (
                                <Badge
                                  variant="secondary"
                                  className="font-mono text-[0.65rem]"
                                >
                                  {kind}
                                </Badge>
                              ) : null}
                              <span
                                className={cn(
                                  'truncate font-medium',
                                  href ? 'text-ink' : 'text-ink-muted',
                                )}
                              >
                                {item.title}
                              </span>
                            </div>
                            {hint ? (
                              <div
                                className={cn(
                                  'mt-0.5 text-xs',
                                  item.completed
                                    ? 'text-success'
                                    : 'text-ink-muted',
                                )}
                              >
                                {hint}
                              </div>
                            ) : null}
                          </div>
                          {item.completed ? (
                            <Check className="h-4 w-4 shrink-0 text-success" />
                          ) : href ? (
                            <span className="shrink-0 text-xs font-medium text-brand">
                              Open
                            </span>
                          ) : null}
                        </>
                      );

                      return (
                        <li key={item.id}>
                          {href ? (
                            <Link
                              href={href}
                              className={cn(
                                'flex items-start gap-3 px-3 py-3 text-sm transition-colors',
                                'hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none',
                                pending && 'opacity-70',
                              )}
                              onClick={() => {
                                if (
                                  item.completionRequirement?.type === 'view'
                                ) {
                                  void markViewed(item.id);
                                }
                              }}
                            >
                              {row}
                            </Link>
                          ) : (
                            <div className="flex items-start gap-3 px-3 py-3 text-sm">
                              {row}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
