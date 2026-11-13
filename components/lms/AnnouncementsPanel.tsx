'use client';

import { useMemo, useState } from 'react';

import { CreateAnnouncementForm } from '@/components/lms/CreateForms';
import { Input } from '@/components/ui/input';

type AnnouncementRow = {
  id: string;
  title: string;
  bodyMarkdown: string;
  createdAt?: string | Date | null;
  published?: boolean;
};

export function AnnouncementsPanel({
  courseId,
  announcements,
  studentPreview = false,
}: {
  courseId: string;
  announcements: AnnouncementRow[];
  studentPreview?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return announcements;
    return announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.bodyMarkdown.toLowerCase().includes(q),
    );
  }, [announcements, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search announcements…"
            className="h-10"
            aria-label="Search announcements"
          />
        </div>
        {!studentPreview ? (
          <CreateAnnouncementForm courseId={courseId} compact />
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-rule/70 bg-surface px-5 py-12 text-center text-sm text-ink-muted">
          {announcements.length === 0
            ? 'No announcements yet.'
            : 'No announcements match your search.'}
        </div>
      ) : (
        <ul className="divide-y divide-rule/70 overflow-hidden rounded-lg border border-rule/70 bg-surface">
          {filtered.map((a) => {
            const when = a.createdAt ? new Date(a.createdAt) : null;
            return (
              <li key={a.id} className="px-4 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-brand">
                    {a.title}
                  </h3>
                  {when && !Number.isNaN(when.getTime()) ? (
                    <time
                      className="text-xs text-ink-muted"
                      dateTime={when.toISOString()}
                    >
                      {when.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </time>
                  ) : null}
                </div>
                {a.bodyMarkdown.trim() ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                    {a.bodyMarkdown}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
