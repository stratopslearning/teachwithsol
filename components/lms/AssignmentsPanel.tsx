'use client';

import { useMemo, useState } from 'react';

import { ChevronDown, ChevronRight, GripVertical } from '@/components/icons';
import { CreateAssignmentGroupForm } from '@/components/lms/CreateForms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { withBasePath } from '@/lib/basePath';
import { cn } from '@/lib/utils';

type GroupRow = {
  id: string;
  name: string;
  weight: number;
  dropLowest: number;
};

export function AssignmentsPanel({
  courseId,
  groups,
  studentPreview = false,
}: {
  courseId: string;
  groups: GroupRow[];
  studentPreview?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="h-10 max-w-sm flex-1"
          aria-label="Search assignment groups"
        />
        {!studentPreview ? (
          <div className="flex flex-wrap items-center gap-2">
            <CreateAssignmentGroupForm courseId={courseId} compact />
            <Button asChild size="sm" className="h-10">
              <a
                href={withBasePath(
                  `/dashboard/professor/assignments/${courseId}`,
                )}
              >
                + Assignment
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-rule/70 bg-surface px-5 py-12 text-center text-sm text-ink-muted">
          {groups.length === 0
            ? 'No assignment groups yet. Add a group to organize quizzes and activities.'
            : 'No groups match your search.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((g) => {
            const isCollapsed = collapsed[g.id] ?? false;
            return (
              <li
                key={g.id}
                className="overflow-hidden rounded-lg border border-rule/70 bg-surface"
              >
                <div className="flex items-center gap-2 bg-muted/40 px-3 py-3">
                  {!studentPreview ? (
                    <GripVertical className="h-4 w-4 shrink-0 text-ink-faint" />
                  ) : null}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() =>
                      setCollapsed((prev) => ({
                        ...prev,
                        [g.id]: !isCollapsed,
                      }))
                    }
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
                    )}
                    <span className="truncate font-medium text-ink">
                      {g.name}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {g.weight}%
                      {g.dropLowest > 0
                        ? ` · drop lowest ${g.dropLowest}`
                        : ''}
                    </span>
                  </button>
                </div>
                <div
                  className={cn(
                    'border-t border-rule/50 px-4 py-6 text-sm text-ink-muted',
                    isCollapsed && 'hidden',
                  )}
                >
                  No assignments in this group.
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
