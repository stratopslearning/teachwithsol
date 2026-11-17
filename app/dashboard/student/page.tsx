import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle,
  FileText,
  GraduationCap,
  Layers,
  TrendingUp,
} from '@/components/icons';

import { AttemptList } from '@/components/AttemptList';
import { EnrollmentList } from '@/components/EnrollmentList';
import StudentEnrollFormWrapper from '@/components/StudentEnrollFormWrapper';
import { StudentDataExportButton } from '@/components/student/StudentDataExportButton';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { StatCard } from '@/components/patterns/StatCard';
import { requireStudent } from '@/lib/auth';
import { appPath } from '@/lib/basePath';
import {
  fetchQuizIdsForSections,
  fetchQuizzesByIds,
  fetchUserEnrollmentsDetail,
  fetchUserSubmittedAttempts,
} from '@/lib/db/facultyStudentReads';
import { partitionEnrollmentsByConclusion } from '@/lib/sections/availability';
import { isQuizListedForStudents } from '@/lib/quiz/availability';

export default async function StudentDashboard() {
  const user = await requireStudent();

  const enrollmentRows = await fetchUserEnrollmentsDetail(user.id);
  const enrollments = enrollmentRows.map((e) => ({
    id: e.id,
    sectionId: e.sectionId,
    status: e.status,
    enrolledAt: e.enrolledAt,
    section: {
      id: e.section.id,
      name: e.section.name,
      endsAt: e.section.endsAt,
      course: e.section.course,
    },
  }));
  const { active: activeEnrollments } =
    partitionEnrollmentsByConclusion(enrollments);

  const sectionIds = activeEnrollments.map((e) => e.sectionId);

  const quizLinks = await fetchQuizIdsForSections(sectionIds);
  const availableQuizzes = await fetchQuizzesByIds([
    ...new Set(quizLinks.map((l) => l.quizId)),
  ]);

  const activeQuizzes = availableQuizzes.filter((quiz) =>
    isQuizListedForStudents({ isActive: quiz.isActive }),
  );
  const uniqueActiveQuizzes = activeQuizzes.filter(
    (quiz, index, self) =>
      index === self.findIndex((q) => q.id === quiz.id),
  );

  const submittedOnly = await fetchUserSubmittedAttempts(user.id, 50);
  const recentAttempts = submittedOnly.slice(0, 5);

  const bestPerQuiz: Record<string, number> = {};
  submittedOnly.forEach((a) => {
    const pct =
      a.percentage ??
      (a.maxScore ? Math.round(((a.score ?? 0) / a.maxScore) * 100) : 0);
    if (bestPerQuiz[a.quizId] == null || pct > bestPerQuiz[a.quizId]) {
      bestPerQuiz[a.quizId] = pct;
    }
  });
  const bestPercentages = Object.values(bestPerQuiz);

  const totalSections = activeEnrollments.length;
  const totalQuizzes = uniqueActiveQuizzes.length;
  const totalAttempts = submittedOnly.length;
  const averageScore =
    bestPercentages.length > 0
      ? Math.round(
          bestPercentages.reduce((sum, p) => sum + p, 0) /
            bestPercentages.length,
        )
      : 0;

  const firstName = user.firstName || 'there';

  return (
    <AppShell
      role="student"
      user={user}
      topbarTitle="Overview"
    >
      <PageHeader
        title={
          <>
            Welcome back,{' '}
            <em
              className="text-brand"
              style={{ fontVariationSettings: '"opsz" 96, "WONK" 1' }}
            >
              {firstName}.
            </em>
          </>
        }
        description="Your sections, open work, and recent progress in one place."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch">
        <StudentEnrollFormWrapper />
        <div className="rounded-xl border border-rule bg-surface-sunken/50 px-5 py-5 sm:px-6">
          <p className="eyebrow">Shortcuts</p>
          <p className="mt-1 font-display text-lg text-ink" style={{ fontVariationSettings: '"opsz" 36' }}>
            Continue studying
          </p>
          <ul className="mt-4 flex flex-col gap-1">
            {[
              {
                href: appPath('/dashboard/student/sections'),
                label: 'My sections',
                hint:
                  totalSections === 1
                    ? '1 section'
                    : `${totalSections} sections`,
                icon: Layers,
              },
              {
                href: appPath('/dashboard/student/calendar'),
                label: 'Calendar',
                hint:
                  totalQuizzes === 1
                    ? '1 quiz due soon'
                    : `${totalQuizzes} quizzes open`,
                icon: CalendarDays,
              },
              {
                href: appPath('/dashboard/student/sections'),
                label: 'Continue in a section',
                hint:
                  averageScore > 0
                    ? `${averageScore}% average · grades inside`
                    : 'Assignments, books & grades',
                icon: GraduationCap,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md border border-rule bg-surface text-ink-muted transition-colors group-hover:border-rule-strong group-hover:text-brand">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">
                        {item.label}
                      </span>
                      <span className="block text-xs text-ink-faint">
                        {item.hint}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <section className="mt-10 flex flex-col gap-5">
        <SectionHeading
          eyebrow="Progress"
          title="This term at a glance"
          description="Totals across every section you are enrolled in."
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard
            label="Sections"
            value={totalSections}
            icon={<Layers className="h-4 w-4" />}
            hint="Currently enrolled"
            href={appPath('/dashboard/student/sections')}
          />
          <StatCard
            label="Open quizzes"
            value={totalQuizzes}
            icon={<FileText className="h-4 w-4" />}
            hint="See calendar"
            href={appPath('/dashboard/student/calendar')}
          />
          <StatCard
            label="Attempts"
            value={totalAttempts}
            icon={<CheckCircle className="h-4 w-4" />}
            hint="In your sections"
            href={appPath('/dashboard/student/sections')}
          />
          <StatCard
            label="Average"
            value={`${averageScore}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Best score per quiz"
            accent
            href={appPath('/dashboard/student/sections')}
          />
        </div>
      </section>

      <section className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SectionHeading
            eyebrow="Sections"
            title="Where you are enrolled"
            actions={
              <Link
                href={appPath('/dashboard/student/sections')}
                className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                View all
              </Link>
            }
          />
          <div className="overflow-hidden rounded-xl border border-rule bg-surface paper-shadow">
            <EnrollmentList enrollments={activeEnrollments} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <SectionHeading
            eyebrow="Activity"
            title="Recent attempts"
            actions={
              <Link
                href={appPath('/dashboard/student/grades')}
                className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                View grades
              </Link>
            }
          />
          <div className="overflow-hidden rounded-xl border border-rule bg-surface paper-shadow">
            <AttemptList attempts={recentAttempts} />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
