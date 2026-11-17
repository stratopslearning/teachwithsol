import { ChevronRight } from '@/components/icons';

import { SolMark } from '@/components/brand/SolMark';
import { withBasePath } from '@/lib/basePath';
import type { DocMeta } from '@/lib/marketing/docs';
import { cn } from '@/lib/utils';

export function DocsNav({
  docs,
  activeSlug,
}: {
  docs: DocMeta[];
  activeSlug?: string;
}) {
  const faculty = docs.filter((d) => d.audience === 'faculty');
  const students = docs.filter((d) => d.audience === 'students');
  const onIndex = !activeSlug;

  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6">
      <a href={withBasePath('/docs')} className="flex items-center gap-2.5 text-ink">
        <SolMark className="h-7 w-7" />
        <span className="rounded-md border border-rule bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Docs
        </span>
      </a>

      <div>
        <p className="eyebrow text-ink-faint mb-2">Guides</p>
        <a
          href={withBasePath('/docs')}
          className={cn(
            'flex items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-colors',
            onIndex
              ? 'bg-surface-sunken font-medium text-ink'
              : 'text-ink-muted hover:bg-surface-sunken/70 hover:text-ink',
          )}
        >
          Overview
          <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />
        </a>
      </div>

      <NavGroup label="Faculty" items={faculty} activeSlug={activeSlug} />
      <NavGroup label="Students" items={students} activeSlug={activeSlug} />

      <div>
        <p className="eyebrow text-ink-faint mb-2">Reference</p>
        <ul className="flex flex-col gap-0.5">
          <RefLink href={withBasePath('/docs/llms.txt')} label="llms.txt" />
          <RefLink href={withBasePath('/docs.md')} label="Markdown index" />
        </ul>
      </div>
    </nav>
  );
}

function NavGroup({
  label,
  items,
  activeSlug,
}: {
  label: string;
  items: DocMeta[];
  activeSlug?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="eyebrow text-ink-faint mb-2">{label}</p>
      <ul className="flex flex-col gap-0.5">
        {items.map((doc) => {
          const active = doc.slug === activeSlug;
          return (
            <li key={doc.slug}>
              <a
                href={withBasePath(`/docs/${doc.slug}`)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm leading-snug transition-colors',
                  active
                    ? 'bg-brand-soft/70 font-medium text-ink'
                    : 'text-ink-muted hover:bg-surface-sunken/70 hover:text-ink',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span>{doc.title}</span>
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    active ? 'text-brand' : 'text-ink-faint',
                  )}
                />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RefLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        className="flex items-center justify-between rounded-xl px-2.5 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-sunken/70 hover:text-ink"
      >
        {label}
        <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />
      </a>
    </li>
  );
}
