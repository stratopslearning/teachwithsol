import Link from 'next/link';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Layers } from '@/components/icons';

import { CreateSectionForm } from '@/app/dashboard/workspace/CreateSectionForm';
import CopyEnrollmentButton from '@/components/CopyEnrollmentButton';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { appPath } from '@/lib/basePath';
import {
  fetchSectionRowsForCourse,
  fetchSectionsByIds,
} from '@/lib/db/entityScopedReads';
import { assertCanManageCourse } from '@/lib/knowledge';
import { isSectionConcluded } from '@/lib/sectionAvailability';
import { loadCourseNav } from '@/lib/lms/loadCourseNav';

export const dynamic = 'force-dynamic';

export default async function CourseHubSectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const user = await requireTeachingAccess();

  const { courseId } = await params;
  const studentView = (await searchParams).as === 'student';
  const lms = await loadCourseNav(courseId);
  let course: { id: string; title: string };
  try {
    course = await assertCanManageCourse(user, courseId);
  } catch {
    notFound();
  }

  // FORCE RLS: bare sections SELECT returns 0 — use DEFINER helpers.
  const sectionIds = (await fetchSectionRowsForCourse(courseId)).map(
    (s) => s.id,
  );
  const sectionRows = (await fetchSectionsByIds(sectionIds)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <CourseHubShell
      courseId={courseId}
      courseTitle={course.title}
      description="Create sections, share enrolment codes, and open a section for roster, email invites, releases, and gradebook — all inside this course."
      activeTab="sections"
      tools={lms.enabled ? lms.facultyTools : undefined}
      nav={lms.nav}
      studentView={studentView}
    >
      <div className="mb-4 max-w-2xl rounded-2xl border border-rule/70 bg-surface-sunken/40 px-4 py-3 text-sm text-ink-muted">
        <p className="font-medium text-ink">Invite to teach or learn</p>
        <p className="mt-1 text-ink-faint">
          Share a section’s faculty or learner code, or open the section for
          email invites and roster. Co-teachers share the same course materials.
        </p>
      </div>
      <div className="mb-6 max-w-xl">
        <CreateSectionForm courseId={courseId} courseTitle={course.title} />
      </div>

      {sectionRows.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          eyebrow="Sections"
          title="No sections yet"
          description="Add a section to generate enrollment codes and start teaching."
        />
      ) : (
        <ul className="max-w-2xl space-y-4">
          {sectionRows.map((s) => {
            const concluded = isSectionConcluded(s);
            return (
              <li
                key={s.id}
                className="overflow-hidden rounded-2xl border border-rule/80 bg-surface paper-shadow"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 px-5 py-4">
                  <div className="min-w-0">
                    <Link
                      href={appPath(
                        `/dashboard/professor/courses/${courseId}/sections/${s.id}`,
                      )}
                      className="font-display text-lg tracking-tight text-ink transition-colors hover:text-brand"
                    >
                      {s.name}
                    </Link>
                    {concluded ? (
                      <Badge variant="secondary" className="ml-2">
                        Concluded
                      </Badge>
                    ) : null}
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={appPath(
                        `/dashboard/professor/courses/${courseId}/sections/${s.id}`,
                      )}
                    >
                      Open
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-ink-faint">
                      Invite faculty
                    </span>
                    <code className="rounded bg-surface-sunken px-2 py-0.5 font-mono text-xs">
                      {s.professorEnrollmentCode}
                    </code>
                    <CopyEnrollmentButton code={s.professorEnrollmentCode} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-ink-faint">
                      Learner
                    </span>
                    <code className="rounded bg-surface-sunken px-2 py-0.5 font-mono text-xs">
                      {s.studentEnrollmentCode}
                    </code>
                    <CopyEnrollmentButton code={s.studentEnrollmentCode} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CourseHubShell>
  );
}
