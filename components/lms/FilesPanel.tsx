'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { withBasePath } from '@/lib/basePath';

type FileRow = {
  id: string;
  title: string;
  status: string;
  createdAt?: string | Date | null;
  byteSize?: number | null;
};

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesPanel({
  courseId,
  files,
  studentPreview = false,
}: {
  courseId: string;
  files: FileRow[];
  studentPreview?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.title.toLowerCase().includes(q));
  }, [files, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Files</h2>
        {!studentPreview ? (
          <Button asChild>
            <a href={withBasePath(`/dashboard/professor/materials/${courseId}`)}>
              Upload
            </a>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files"
          className="h-10 max-w-md flex-1"
          aria-label="Search files"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-rule/70 bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-rule/70 bg-muted/30 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-ink-muted"
                >
                  {files.length === 0
                    ? 'No files yet.'
                    : 'No files match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((f, i) => {
                const when = f.createdAt ? new Date(f.createdAt) : null;
                return (
                  <tr
                    key={f.id}
                    className={
                      i % 2 === 0
                        ? 'bg-surface'
                        : 'bg-muted/20'
                    }
                  >
                    <td className="px-4 py-3 font-medium text-brand">
                      {f.title}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {when && !Number.isNaN(when.getTime())
                        ? when.toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {formatBytes(f.byteSize)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {f.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
