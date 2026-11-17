import type { ReactNode } from 'react';
import { ChevronRight } from '@/components/icons';

import { DocsNav } from '@/components/docs/DocsNav';
import type { DocMeta } from '@/lib/marketing/docs';

export function DocsLayout({
  docs,
  activeSlug,
  children,
}: {
  docs: DocMeta[];
  activeSlug?: string;
  children: ReactNode;
}) {
  return (
    <div className="page-rail px-4 md:px-8">
      <div className="grid gap-10 py-10 md:grid-cols-[15.5rem_minmax(0,1fr)] md:gap-12 md:py-14 lg:gap-16">
        <aside className="md:sticky md:top-24 md:self-start md:max-h-[calc(100vh-7rem)] md:overflow-y-auto">
          <details className="group md:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
              Guides
              <ChevronRight className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-4 pb-2">
              <DocsNav docs={docs} activeSlug={activeSlug} />
            </div>
          </details>
          <div className="hidden md:block">
            <DocsNav docs={docs} activeSlug={activeSlug} />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
