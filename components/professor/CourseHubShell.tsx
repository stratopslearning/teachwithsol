import Link from 'next/link';
import type { ReactNode } from 'react';

import { Eye, EyeOff } from '@/components/icons';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { withBasePath } from '@/lib/basePath';
import {
  COURSE_TOOL_LABELS,
  courseLmsShellEnabled,
  facultyToolSuffix,
  visibleStudentTools,
  type CourseLmsNavigation,
  type CourseToolId,
} from '@/lib/lms/courseNav';
import { cn } from '@/lib/utils';

/** Legacy tabs when LMS shell flag is off. */
export type CourseHubTab = 'overview' | 'sections' | CourseToolId;

const LEGACY_TABS: { id: CourseHubTab; label: string; suffix: string }[] = [
  { id: 'overview', label: 'Overview', suffix: '' },
  { id: 'sections', label: 'Sections', suffix: '/sections' },
];

/** Faculty-only extras kept in the course rail (not student-facing tools). */
const FACULTY_EXTRA = [
  { id: 'sections' as const, label: 'Sections', suffix: '/sections' },
];

export function CourseHubShell({
  courseId,
  courseTitle,
  description,
  activeTab,
  actions,
  children,
  tools,
  nav,
  studentView = false,
}: {
  courseId: string;
  courseTitle: string;
  description?: string;
  activeTab: CourseHubTab;
  actions?: ReactNode;
  children: ReactNode;
  tools?: CourseToolId[];
  /** Full nav config — used to show eye-off on tools hidden from students. */
  nav?: CourseLmsNavigation;
  /** Preview the course the way a student sees tools. */
  studentView?: boolean;
}) {
  const base = `/dashboard/professor/courses/${courseId}`;
  const lmsOn = courseLmsShellEnabled() && tools && tools.length > 0;

  const studentToolIds = nav
    ? visibleStudentTools(nav)
    : (tools ?? []).filter((t) => t !== 'settings');

  const facultyTabs = lmsOn
    ? [
        ...tools.map((id) => ({
          id: id as CourseHubTab,
          label: COURSE_TOOL_LABELS[id],
          suffix: facultyToolSuffix(id),
          hiddenFromStudents: nav
            ? Boolean(nav.tools.find((t) => t.id === id)?.hidden)
            : false,
        })),
        ...FACULTY_EXTRA.map((t) => ({ ...t, hiddenFromStudents: false })),
      ]
    : LEGACY_TABS.map((t) => ({ ...t, hiddenFromStudents: false }));

  const tabs = studentView
    ? studentToolIds.map((id) => ({
        id: id as CourseHubTab,
        label: COURSE_TOOL_LABELS[id],
        suffix: facultyToolSuffix(id),
        hiddenFromStudents: false,
      }))
    : facultyTabs;

  const normalizedActive: CourseHubTab =
    activeTab === 'home' || activeTab === 'overview'
      ? lmsOn
        ? 'home'
        : 'overview'
      : activeTab;

  const studentViewHref = withBasePath(
    `${base}${facultyToolSuffix(
      normalizedActive === 'overview' ? 'home' : (normalizedActive as CourseToolId),
    )}?as=student`,
  );
  const exitStudentViewHref = withBasePath(
    `${base}${facultyToolSuffix(
      normalizedActive === 'overview' ? 'home' : (normalizedActive as CourseToolId),
    )}`,
  );

  return (
    <AppShell role="professor" active="courses" topbarTitle={courseTitle}>
      <PageHeader
        eyebrow="Course"
        title={courseTitle}
        description={description}
        breadcrumbs={[
          {
            label: 'Courses',
            href: withBasePath('/dashboard/professor/courses'),
          },
          { label: courseTitle },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {lmsOn ? (
              studentView ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={exitStudentViewHref}>
                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                    Exit student view
                  </Link>
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={studentViewHref}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Student view
                  </Link>
                </Button>
              )
            ) : null}
            {actions}
          </div>
        }
      />

      {studentView ? (
        <div className="mt-4 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-ink">
          Viewing as a student — unpublished tools and items stay hidden.
        </div>
      ) : null}

      {lmsOn ? (
        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-10">
          <nav
            className="w-full shrink-0 border-b border-rule/70 pb-4 lg:w-48 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
            aria-label="Course tools"
          >
            <ul className="flex flex-row flex-wrap gap-1 lg:flex-col lg:gap-0.5">
              {tabs.map((tab) => {
                const href = withBasePath(
                  `${base}${tab.suffix}${studentView ? '?as=student' : ''}`,
                );
                const isActive =
                  tab.id === normalizedActive ||
                  (normalizedActive === 'home' && tab.id === 'overview') ||
                  (normalizedActive === 'overview' && tab.id === 'home');
                return (
                  <li key={`${tab.id}-${tab.suffix}`}>
                    <Link
                      href={href}
                      className={cn(
                        'relative flex items-center justify-between gap-2 border-l-2 px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'border-brand bg-brand/5 font-semibold text-brand'
                          : 'border-transparent text-ink hover:bg-surface/70 hover:text-ink',
                      )}
                    >
                      <span>{tab.label}</span>
                      {!studentView && tab.hiddenFromStudents ? (
                        <EyeOff
                          className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                          aria-label="Hidden from students"
                        />
                      ) : null}
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
            aria-label="Course tools"
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
