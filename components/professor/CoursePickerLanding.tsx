import Link from 'next/link';
import { ArrowRight, BookOpen, Layers } from '@/components/icons';

import { EmptyState } from '@/components/patterns/EmptyState';
import { Button } from '@/components/ui/button';
import { appPath } from '@/lib/basePath';
import { fillCourseHrefTemplate } from '@/lib/professor/courseHref';
import { cn } from '@/lib/utils';

export type CoursePickerOption = {
  id: string;
  title: string;
  sectionCount?: number;
};

export function CoursePickerLanding({
  courses,
  toolLabel,
  hrefTemplate,
  emptyHref = '/dashboard/professor/courses',
}: {
  courses: CoursePickerOption[];
  toolLabel: string;
  /** Path with `{courseId}` placeholder. */
  hrefTemplate: string;
  emptyHref?: string;
}) {
  if (courses.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-5 w-5" aria-hidden />}
        title="No courses yet"
        description={`Create a course first, then open ${toolLabel}.`}
        actions={
          <Button asChild>
            <Link href={appPath(emptyHref)}>Go to Courses</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Your courses
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Open one to continue {toolLabel}.
          </p>
        </div>
        <p className="shrink-0 text-xs text-ink-faint">
          {courses.length} course{courses.length === 1 ? '' : 's'}
        </p>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {courses.map((course, index) => {
          const sections = course.sectionCount ?? 0;
          return (
            <li
              key={course.id}
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              className="animate-fade-in"
            >
              <Link
                href={appPath(
                  fillCourseHrefTemplate(hrefTemplate, course.id),
                )}
                className={cn(
                  'group relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-rule/70 bg-surface p-5 transition-all duration-200',
                  'hover:border-rule-strong hover:bg-surface-elevated',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                )}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-4 left-0 w-0.5 rounded-full bg-brand/0 transition-all duration-200 group-hover:w-1 group-hover:bg-brand"
                />
                <span className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rule bg-surface-sunken text-ink-muted transition-colors duration-200 group-hover:border-brand/30 group-hover:bg-brand-soft group-hover:text-brand">
                    <BookOpen className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors group-hover:text-brand">
                    Open
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block font-medium leading-snug text-ink">
                    {course.title}
                  </span>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rule/80 bg-surface-sunken/60 px-1.5 py-0.5 text-xs text-ink-faint">
                    <Layers className="h-3 w-3" aria-hidden />
                    {sections} section{sections === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
