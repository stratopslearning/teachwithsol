'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { withBasePath } from '@/lib/basePath';

type SectionRow = {
  id: string;
  name: string;
};

export function GradesPanel({
  sections,
  studentPreview = false,
}: {
  sections: SectionRow[];
  studentPreview?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Gradebook</h2>
        {!studentPreview ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled>
              Import
            </Button>
            <Button variant="outline" size="sm" disabled>
              Export
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search students…"
          className="h-10 max-w-xs"
          disabled
          aria-label="Search students"
        />
        <Input
          placeholder="Search assignments…"
          className="h-10 max-w-xs"
          disabled
          aria-label="Search assignments"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-rule/70 bg-surface">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-rule/70 bg-muted/30 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Section</th>
              <th className="px-4 py-3 font-medium">Gradebook</th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-10 text-center text-ink-muted"
                >
                  No teachable sections yet.
                </td>
              </tr>
            ) : (
              sections.map((s, i) => (
                <tr
                  key={s.id}
                  className={i % 2 === 0 ? 'bg-surface' : 'bg-muted/20'}
                >
                  <td className="px-4 py-3 font-medium text-brand">
                    {s.name}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      className="text-brand hover:underline"
                      href={withBasePath(
                        `/dashboard/professor/sections/${s.id}/gradebook`,
                      )}
                    >
                      Open gradebook
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
