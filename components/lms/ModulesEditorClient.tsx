'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Lock,
  Plus,
  Trash2,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { withBasePath } from '@/lib/basePath';
import { cn } from '@/lib/utils';

type Item = {
  id: string;
  title: string;
  type: string;
  isHeader: boolean;
  published: boolean;
  lessonId?: string | null;
  quizId?: string | null;
  interactiveId?: string | null;
  chatbotId?: string | null;
  completionRequirement: {
    type: 'view' | 'submit' | 'score_at_least';
    minPercent?: number;
  } | null;
};

type ModuleRow = {
  id: string;
  title: string;
  position: number;
  published: boolean;
  unlockAt: string | null;
  prerequisiteModuleIds: string[];
  items: Item[];
};

function itemIcon(type: string, isHeader: boolean) {
  if (isHeader || type === 'HEADER') return FileText;
  if (type === 'LESSON') return BookOpen;
  return FileText;
}

function typeLabel(item: Item): string | null {
  if (item.isHeader) return null;
  if (item.type === 'LESSON') return 'Interactive lesson';
  if (item.type === 'QUIZ') return 'Quiz';
  if (item.type === 'INTERACTIVE') return 'Interactive';
  if (item.type === 'DISCUSSION' || item.type === 'TUTOR') return 'Discussion';
  return null;
}

function reqLabel(item: Item): string | null {
  const r = item.completionRequirement;
  if (!r) return null;
  if (r.type === 'view') return 'View';
  if (r.type === 'submit') {
    return item.type === 'LESSON' ? 'Section checks' : 'Submit';
  }
  if (r.type === 'score_at_least') {
    return `Score ≥ ${r.minPercent ?? 70}%`;
  }
  return null;
}

function itemHref(courseId: string, item: Item): string | null {
  if (item.lessonId) {
    return withBasePath(
      `/dashboard/professor/courses/${courseId}/lessons/${item.lessonId}?as=student`,
    );
  }
  if (item.quizId) {
    return withBasePath(`/dashboard/professor/quiz/${item.quizId}`);
  }
  if (item.interactiveId) {
    return withBasePath(
      `/dashboard/professor/interactive/${item.interactiveId}`,
    );
  }
  return null;
}

export function ModulesEditorClient({
  courseId,
  initialModules,
  studentPreview = false,
}: {
  courseId: string;
  initialModules: ModuleRow[];
  /** Faculty “Student view” — hide unpublished, show lock/prereq chrome. */
  studentPreview?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [allCollapsed, setAllCollapsed] = useState(false);

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mod of initialModules) m.set(mod.id, mod.title);
    return m;
  }, [initialModules]);

  const visibleModules = studentPreview
    ? initialModules
        .filter((m) => m.published)
        .map((m) => ({
          ...m,
          items: m.items.filter((i) => i.published || i.isHeader),
        }))
    : initialModules;

  async function createModule() {
    setError(null);
    const res = await fetch(`/api/lms/courses/${courseId}/modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() || 'New module' }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Failed to create module');
      return;
    }
    setTitle('');
    startTransition(() => router.refresh());
  }

  async function togglePublish(moduleId: string, published: boolean) {
    setError(null);
    const res = await fetch(
      `/api/lms/courses/${courseId}/modules/${moduleId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !published }),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Failed to update module');
      return;
    }
    startTransition(() => router.refresh());
  }

  async function publishAll() {
    setError(null);
    for (const m of initialModules) {
      if (m.published) continue;
      const res = await fetch(
        `/api/lms/courses/${courseId}/modules/${m.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ published: true }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Publish all failed');
        return;
      }
    }
    startTransition(() => router.refresh());
  }

  async function addHeader(moduleId: string) {
    setError(null);
    const res = await fetch(
      `/api/lms/courses/${courseId}/modules/${moduleId}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Text header',
          type: 'HEADER',
          isHeader: true,
        }),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Failed to add header');
      return;
    }
    startTransition(() => router.refresh());
  }

  async function removeModule(moduleId: string, title: string) {
    if (
      !confirm(
        `Delete module “${title}”? Its items will be removed from the course modules list.`,
      )
    ) {
      return;
    }
    setError(null);
    const res = await fetch(
      `/api/lms/courses/${courseId}/modules/${moduleId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Failed to delete module');
      return;
    }
    startTransition(() => router.refresh());
  }

  async function setRequirement(
    moduleId: string,
    itemId: string,
    type: 'view' | 'submit' | 'score_at_least' | 'none',
  ) {
    setError(null);
    const res = await fetch(
      `/api/lms/courses/${courseId}/modules/${moduleId}/items/${itemId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completionRequirement:
            type === 'none'
              ? null
              : type === 'score_at_least'
                ? { type, minPercent: 70 }
                : { type },
        }),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Failed to update requirement');
      return;
    }
    startTransition(() => router.refresh());
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function collapseAll() {
    const next = !allCollapsed;
    setAllCollapsed(next);
    const map: Record<string, boolean> = {};
    for (const m of visibleModules) map[m.id] = next;
    setCollapsed(map);
  }

  return (
    <div className="space-y-4">
      {!studentPreview ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={collapseAll}
              disabled={visibleModules.length === 0}
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || initialModules.every((m) => m.published)}
              onClick={() => void publishAll()}
            >
              Publish all
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Module name"
              className="h-9 w-44"
            />
            <Button
              size="sm"
              disabled={pending}
              onClick={() => void createModule()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Module
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {visibleModules.length === 0 ? (
        <div className="rounded-lg border border-rule/70 bg-surface px-5 py-10 text-center text-sm text-ink-muted">
          {studentPreview
            ? 'No published modules yet.'
            : 'No modules yet. Add a module or build smart modules from Authoring.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleModules.map((m) => {
            const isCollapsed = collapsed[m.id] ?? false;
            const prereqNames = (m.prerequisiteModuleIds ?? [])
              .map((id) => titleById.get(id))
              .filter(Boolean) as string[];
            const requiredCount = m.items.filter(
              (i) => !i.isHeader && i.completionRequirement,
            ).length;

            return (
              <li
                key={m.id}
                className="overflow-hidden rounded-md border border-rule/80 bg-surface"
              >
                <div className="flex items-center gap-2 bg-muted/40 px-3 py-2.5">
                  <button
                    type="button"
                    className="rounded p-0.5 text-ink-muted hover:text-ink"
                    onClick={() => toggleCollapse(m.id)}
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
                      {requiredCount > 0 ? (
                        <span>Complete all items</span>
                      ) : null}
                      {m.unlockAt ? (
                        <span>
                          Unlocks {new Date(m.unlockAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {!studentPreview ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={m.published ? 'Published' : 'Unpublished'}
                        className={cn(
                          'rounded p-1',
                          m.published
                            ? 'text-success'
                            : 'text-ink-faint hover:text-ink-muted',
                        )}
                        disabled={pending}
                        onClick={() => void togglePublish(m.id, m.published)}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        disabled={pending}
                        onClick={() => void addHeader(m.id)}
                        title="Add item"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-ink-muted hover:text-destructive"
                        disabled={pending}
                        onClick={() => void removeModule(m.id, m.title)}
                        title="Delete module"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : m.published ? (
                    <Check className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <Lock className="h-4 w-4 shrink-0 text-ink-faint" />
                  )}
                </div>

                {!isCollapsed ? (
                  <ul className="divide-y divide-rule/50">
                    {m.items.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-ink-muted">
                        No items in this module
                      </li>
                    ) : (
                      m.items.map((item) => {
                        const Icon = itemIcon(item.type, item.isHeader);
                        const label = reqLabel(item);
                        const kind = typeLabel(item);
                        const href = studentPreview
                          ? itemHref(courseId, item)
                          : item.lessonId
                            ? itemHref(courseId, item)
                            : null;
                        return (
                          <li
                            key={item.id}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2.5 text-sm',
                              item.isHeader && 'bg-muted/20 font-medium',
                            )}
                          >
                            {!studentPreview ? (
                              <GripVertical className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                            ) : (
                              <span className="w-3.5" />
                            )}
                            <Icon className="h-4 w-4 shrink-0 text-ink-muted" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-ink">
                                {href ? (
                                  <Link
                                    href={href}
                                    className="text-brand hover:underline"
                                  >
                                    {item.title}
                                  </Link>
                                ) : (
                                  item.title
                                )}
                              </div>
                              {kind || label ? (
                                <div className="text-xs text-ink-muted">
                                  {[kind, label].filter(Boolean).join(' · ')}
                                </div>
                              ) : null}
                            </div>
                            {!studentPreview && !item.isHeader ? (
                              <select
                                className="max-w-[9rem] rounded border border-rule bg-background px-1.5 py-1 text-xs"
                                value={item.completionRequirement?.type ?? 'none'}
                                onChange={(e) =>
                                  void setRequirement(
                                    m.id,
                                    item.id,
                                    e.target.value as
                                      | 'view'
                                      | 'submit'
                                      | 'score_at_least'
                                      | 'none',
                                  )
                                }
                              >
                                <option value="none">No requirement</option>
                                <option value="view">Must view</option>
                                <option value="submit">Must submit</option>
                                <option value="score_at_least">Score ≥ 70%</option>
                              </select>
                            ) : null}
                            {!studentPreview ? (
                              <span
                                className={cn(
                                  'shrink-0',
                                  item.published
                                    ? 'text-success'
                                    : 'text-ink-faint',
                                )}
                                title={item.published ? 'Published' : 'Draft'}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            ) : null}
                          </li>
                        );
                      })
                    )}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
