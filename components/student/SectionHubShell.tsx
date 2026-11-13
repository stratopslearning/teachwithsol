import Link from 'next/link';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { withBasePath } from '@/lib/basePath';
import {
  COURSE_TOOL_LABELS,
  courseLmsShellEnabled,
  studentToolSuffix,
  type CourseToolId,
} from '@/lib/lms/courseNav';
import { cn } from '@/lib/utils';

export type SectionHubTab =
  | 'overview'
  | 'books'
  | 'assignments'
  | 'grades'
  | 'work'
  | CourseToolId;

const LEGACY_TABS: { id: SectionHubTab; label: string; suffix: string }[] = [
  { id: 'overview', label: 'Overview', suffix: '' },
  { id: 'books', label: 'Books', suffix: '/books' },
  { id: 'assignments', label: 'Assignments', suffix: '/assignments' },
  { id: 'grades', label: 'Grades', suffix: '/grades' },
];

export function SectionHubShell({
  sectionId,
  sectionName,
  courseTitle,
  description,
  activeTab,
  actions,
  user,
  children,
  tools,
}: {
  sectionId: string;
  sectionName: string;
  courseTitle: string;
  description?: string;
  activeTab: SectionHubTab;
  actions?: ReactNode;
  instructorUnverified?: boolean;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    paid?: boolean | null;
  };
  children: ReactNode;
  tools?: CourseToolId[];
}) {
  const base = `/dashboard/student/sections/${sectionId}`;
  const title = `${courseTitle} · ${sectionName}`;
  const lmsOn = courseLmsShellEnabled() && tools && tools.length > 0;

  const tabs = lmsOn
    ? tools.map((id) => ({
        id: id as SectionHubTab,
        label: COURSE_TOOL_LABELS[id],
        suffix: studentToolSuffix(id),
      }))
    : LEGACY_TABS;

  const normalizedActive: SectionHubTab =
    activeTab === 'home' || activeTab === 'overview'
      ? lmsOn
        ? 'home'
        : 'overview'
      : activeTab === 'files' && !lmsOn
        ? 'books'
        : activeTab;

  return (
    <AppShell
      role="student"
      active="sections"
      user={user}
      topbarTitle={sectionName}
    >
      <PageHeader
        eyebrow="Section"
        title={title}
        description={description}
        breadcrumbs={[
          {
            label: 'Sections',
            href: withBasePath('/dashboard/student/sections'),
          },
          { label: sectionName },
        ]}
        actions={actions}
      />

      {lmsOn ? (
        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-10">
          <nav
            className="w-full shrink-0 border-b border-rule/70 pb-4 lg:w-48 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
            aria-label="Section tools"
          >
            <ul className="flex flex-row flex-wrap gap-1 lg:flex-col lg:gap-0.5">
              {tabs.map((tab) => {
                const href = withBasePath(`${base}${tab.suffix}`);
                const isActive =
                  tab.id === normalizedActive ||
                  (normalizedActive === 'home' && tab.id === 'overview') ||
                  (normalizedActive === 'overview' && tab.id === 'home') ||
                  (normalizedActive === 'files' && tab.id === 'books') ||
                  (normalizedActive === 'books' && tab.id === 'files');
                return (
                  <li key={`${tab.id}-${tab.suffix}`}>
                    <Link
                      href={href}
                      className={cn(
                        'block border-l-2 px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'border-brand bg-brand/5 font-semibold text-brand'
                          : 'border-transparent text-ink hover:bg-surface/70 hover:text-ink',
                      )}
                    >
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        <>
          <nav
            className="mt-6 flex flex-wrap gap-1 border-b border-rule/70"
            aria-label="Section"
          >
            {tabs.map((tab) => {
              const href = withBasePath(`${base}${tab.suffix}`);
              const isActive =
                tab.id === normalizedActive ||
                (normalizedActive === 'home' && tab.id === 'overview') ||
                (normalizedActive === 'overview' && tab.id === 'home');
              return (
                <Link
                  key={`${tab.id}-${tab.suffix}`}
                  href={href}
                  className={cn(
                    'relative px-3 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'font-medium text-ink'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {tab.label}
                  {isActive ? (
                    <span
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                      aria-hidden
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="mt-8">{children}</div>
        </>
      )}
    </AppShell>
  );
}
