'use client';

import Link from 'next/link';
import { ArrowUpRight, ChevronDown } from '@/components/icons';

import { CodeChip } from '@/app/dashboard/workspace/CodeChip';
import { CreateSectionForm } from '@/app/dashboard/workspace/CreateSectionForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { appPath } from '@/lib/basePath';
import { cn } from '@/lib/utils';

export type WorkspaceCourseListItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sections: {
    id: string;
    name: string;
    professorEnrollmentCode: string;
    studentEnrollmentCode: string;
  }[];
};

export function WorkspaceCourseList({
  courses,
  canAddSections,
}: {
  courses: WorkspaceCourseListItem[];
  canAddSections: boolean;
}) {
  return (
    <ul className="space-y-5">
      {courses.map((c, index) => (
        <CourseCard
          key={c.id}
          course={c}
          canAddSections={canAddSections}
          defaultOpen={index === 0}
        />
      ))}
    </ul>
  );
}

function CourseCard({
  course: c,
  canAddSections,
  defaultOpen,
}: {
  course: WorkspaceCourseListItem;
  canAddSections: boolean;
  defaultOpen: boolean;
}) {
  return (
    <li className="overflow-hidden rounded-2xl border border-rule/80 bg-surface paper-shadow">
      <Collapsible defaultOpen={defaultOpen}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule/60 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <CollapsibleTrigger
              type="button"
              className={cn(
                'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors',
                'hover:bg-surface-sunken hover:text-ink',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                '[&[data-state=open]>svg]:rotate-180',
              )}
              aria-label={`Toggle sections for ${c.title}`}
            >
              <ChevronDown className="h-4 w-4 transition-transform duration-200" />
            </CollapsibleTrigger>
            <div className="min-w-0">
              <h3 className="font-display text-xl tracking-tight text-ink">
                <Link
                  href={appPath(`/dashboard/professor/courses/${c.id}`)}
                  className="transition-colors hover:text-brand"
                >
                  {c.title}
                </Link>
              </h3>
              {c.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                  {c.description}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-ink-faint">
                {c.sections.length} section{c.sections.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {c.status}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={appPath(`/dashboard/professor/courses/${c.id}`)}>
                Course hub
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down data-[state=open]:[animation-duration:160ms] data-[state=closed]:[animation-duration:140ms]">
          <div className="px-5 py-4 sm:px-6">
            {c.sections.length > 0 ? (
              <ul className="divide-y divide-rule/50">
                {c.sections.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={appPath(
                          `/dashboard/professor/courses/${c.id}/sections/${s.id}`,
                        )}
                        className="font-medium text-ink transition-colors hover:text-brand"
                      >
                        {s.name}
                      </Link>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={appPath(
                            `/dashboard/professor/courses/${c.id}/sections/${s.id}`,
                          )}
                        >
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CodeChip
                        label="Faculty"
                        code={s.professorEnrollmentCode}
                      />
                      <CodeChip
                        label="Learner"
                        code={s.studentEnrollmentCode}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-ink-muted">
                No sections yet — add one to start inviting learners.
              </p>
            )}

            {canAddSections ? (
              <div className="mt-3 border-t border-rule/50 pt-3">
                <CreateSectionForm courseId={c.id} courseTitle={c.title} />
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
