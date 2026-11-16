import Link from 'next/link';
import { BookOpen, ClipboardList } from '@/components/icons';

import { ContinueReadingCard } from '@/components/books/ContinueReadingCard';
import { StatCard } from '@/components/patterns/StatCard';
import { SectionHubShell } from '@/components/student/SectionHubShell';
import { listStudentActivities } from '@/lib/assignments';
import { requireStudent } from '@/lib/auth';
import { appPath } from '@/lib/basePath';
import { listStudentBooks } from '@/lib/books';
import { loadCourseNav } from '@/lib/lms/loadCourseNav';
import { requireStudentSectionAccess } from '@/lib/student/sectionAccess';
import { isStudentSectionInUnverifiedCreatorWorkspace } from '@/lib/student/sectionWorkspace';

export default async function StudentSectionOverviewPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const user = await requireStudent();
  const { sectionId } = await params;
  const ctx = await requireStudentSectionAccess(user.id, sectionId);

  const [books, activities, instructorUnverified, lms] = await Promise.all([
    listStudentBooks(user.id, { sectionId }),
    listStudentActivities({
      studentId: user.id,
      sectionIds: [sectionId],
    }),
    isStudentSectionInUnverifiedCreatorWorkspace(sectionId),
    loadCourseNav(ctx.courseId),
  ]);

  const openWork = activities.filter(
    (a) =>
      a.type === 'QUIZ'
        ? true
        : (a.completionStatus ?? 'NOT_STARTED') !== 'COMPLETED',
  ).length;

  return (
    <SectionHubShell
      sectionId={ctx.sectionId}
      sectionName={ctx.sectionName}
      courseTitle={ctx.courseTitle}
      description="Your home for this section — books, assigned work, and grades."
      activeTab={lms.enabled ? 'home' : 'overview'}
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
      instructorUnverified={instructorUnverified}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Books"
          value={String(books.length)}
          icon={<BookOpen className="h-4 w-4" />}
        />
        <StatCard
          label="Open work"
          value={String(openWork)}
          icon={<ClipboardList className="h-4 w-4" />}
        />
      </div>

      <div className="mt-8 space-y-3">
        <ContinueReadingCard
          sectionId={sectionId}
          books={books.map((b) => ({ id: b.id, title: b.title }))}
        />

        <div className="flex flex-wrap gap-2">
          <Link
            href={appPath(
              `/dashboard/student/sections/${sectionId}/books`,
            )}
            className="rounded-lg border border-rule px-3 py-2 text-sm text-ink transition-colors hover:border-rule-strong hover:bg-surface"
          >
            Browse books
          </Link>
          <Link
            href={appPath(
              `/dashboard/student/sections/${sectionId}/assignments`,
            )}
            className="rounded-lg border border-rule px-3 py-2 text-sm text-ink transition-colors hover:border-rule-strong hover:bg-surface"
          >
            View assignments
          </Link>
          <Link
            href={appPath(
              `/dashboard/student/sections/${sectionId}/grades`,
            )}
            className="rounded-lg border border-rule px-3 py-2 text-sm text-ink transition-colors hover:border-rule-strong hover:bg-surface"
          >
            Grades
          </Link>
        </div>
      </div>
    </SectionHubShell>
  );
}
