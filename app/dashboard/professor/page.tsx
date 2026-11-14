import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  FileText,
  KeyRound,
  Layers,
  Plus,
  TrendingUp,
} from '@/components/icons';

import { TeacherHomeChecklist } from '@/components/professor/TeacherHomeChecklist';
import ExportResultsWrapper from '@/components/ExportResultsWrapper';
import ProfessorEnrollForm from '@/components/ProfessorEnrollForm';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { StatCard } from '@/components/patterns/StatCard';
import { QuickRegradeButton } from '@/components/quiz/QuickRegradeButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { appPath, withBasePath } from '@/lib/basePath';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { getAttentionItemsForProfessor } from '@/lib/professorAttention';
import { partitionEnrollmentsByConclusion } from '@/lib/sectionAvailability';
import { getTeacherHomeChecklistSteps } from '@/lib/professor/teacherHomeChecklist';
import {
  getActiveWorkspaceId,
  listActiveMembershipsForUser,
} from '@/lib/workspace';

export default async function ProfessorDashboard() {
  const user = await requireTeachingAccess();

  const { listTeachingSectionIds } = await import(
    '@/lib/professor/graderSections'
  );
  const { fetchSectionsByIds } = await import('@/lib/db/entityScopedReads');
  const {
    fetchQuizIdsForSections,
    fetchQuizzesByIds,
    fetchRecentAttemptsForSections,
    fetchAttemptScoreRowsForSections,
  } = await import('@/lib/db/facultyStudentReads');

  const teachingSectionIds = await listTeachingSectionIds(user);
  const teachingSections = await fetchSectionsByIds(teachingSectionIds);
  const sectionRows = teachingSections.map((section) => ({
    sectionId: section.id,
    section: {
      id: section.id,
      name: section.name,
      endsAt: section.endsAt,
      course: section.course
        ? { id: section.course.id, title: section.course.title }
        : null,
    },
  }));
  const { active: ongoingEnrollments } =
    partitionEnrollmentsByConclusion(sectionRows);

  const sectionIds = ongoingEnrollments.map((e) => e.sectionId);

  const sectionQuizLinks = await fetchQuizIdsForSections(sectionIds);
  const assignedQuizIds = [...new Set(sectionQuizLinks.map((qs) => qs.quizId))];
  const professorQuizzes = await fetchQuizzesByIds(assignedQuizIds);

  const attentionItems = await getAttentionItemsForProfessor(user.id, {
    limit: 8,
  });
  const attentionTotalPreview = attentionItems.reduce(
    (s, i) => s + i.needsAttentionCount,
    0,
  );

  const recentAttemptRows = await fetchRecentAttemptsForSections(sectionIds, 5);
  const recentAttempts = recentAttemptRows.map((attempt) => ({
    ...attempt,
    student: {
      firstName: attempt.student.firstName,
      lastName: attempt.student.lastName,
      email: attempt.student.email,
    },
    passed: (attempt.percentage ?? 0) >= 70,
  }));

  const submittedAttemptsList =
    await fetchAttemptScoreRowsForSections(sectionIds);

  const totalSections = ongoingEnrollments.length;
  const activeQuizzes = professorQuizzes.filter((q) => q.isActive).length;
  const bestPerStudentQuiz: Record<string, number> = {};
  submittedAttemptsList.forEach((a) => {
    const key = `${a.studentId}:${a.quizId}`;
    const pct =
      a.percentage ??
      (a.maxScore ? Math.round(((a.score ?? 0) / a.maxScore) * 100) : 0);
    if (bestPerStudentQuiz[key] == null || pct > bestPerStudentQuiz[key]) {
      bestPerStudentQuiz[key] = pct;
    }
  });
  const bestPercentages = Object.values(bestPerStudentQuiz);
  const averageScore =
    bestPercentages.length > 0
      ? Math.round(
          bestPercentages.reduce((sum, p) => sum + p, 0) /
            bestPercentages.length,
        )
      : 0;

  const deskSections = ongoingEnrollments.slice(0, 6);
  const firstName = user.firstName || user.email;

  const facultyMemberships = await listActiveMembershipsForUser(user.id);
  const activeWorkspaceId = await getActiveWorkspaceId(user.id);
  const activeMembership =
    facultyMemberships.find((m) => m.workspaceId === activeWorkspaceId) ??
    facultyMemberships[0];
  const activeWorkspace = activeMembership?.workspace;
  const checklistSteps = activeWorkspace
    ? await getTeacherHomeChecklistSteps(activeWorkspace.id)
    : [];

  const shortcuts = [
    {
      href: appPath('/dashboard/workspace/knowledge'),
      label: 'Knowledge',
      hint: 'Library & course materials',
      icon: FileText,
    },
    {
      href: appPath('/dashboard/professor/authoring'),
      label: 'Authoring',
      hint: 'Draft from materials',
      icon: BookOpen,
    },
    {
      href: appPath('/dashboard/professor/courses'),
      label: 'Courses',
      hint: 'Modules & assignments',
      icon: Plus,
    },
    {
      href: appPath('/dashboard/professor/attention'),
      label: 'Attention queue',
      hint:
        attentionTotalPreview > 0
          ? `${attentionTotalPreview} waiting`
          : 'Queue clear',
      icon: AlertTriangle,
    },
  ];

  return (
    <AppShell role="professor" topbarTitle="Overview">
      <PageHeader
        title={
          <>
            {firstName}
            <span className="text-ink-muted font-normal">’s desk</span>
          </>
        }
        description="Use Knowledge, Authoring, and Assignments from the sidebar. Open a course for sections, analytics, and insights. Attention and results stay global."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <a href={withBasePath('/dashboard/professor/quiz/new')}>
                <Plus className="h-4 w-4" />
                New quiz
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={withBasePath('/dashboard/professor/attention')}>
                <AlertTriangle className="h-4 w-4" />
                Attention
                {attentionTotalPreview > 0 ? (
                  <Badge variant="warning" className="ml-1">
                    {attentionTotalPreview}
                  </Badge>
                ) : null}
              </a>
            </Button>
          </div>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch">
        <div className="flex flex-col gap-6">
          <ProfessorEnrollForm />
          {checklistSteps.length > 0 ? (
            <TeacherHomeChecklist steps={checklistSteps} />
          ) : null}
        </div>
        <div className="rounded-xl border border-rule bg-surface-sunken/50 px-5 py-5 sm:px-6">
          <p className="eyebrow">Shortcuts</p>
          <p
            className="mt-1 font-display text-lg text-ink"
            style={{ fontVariationSettings: '"opsz" 36' }}
          >
            Keep teaching moving
          </p>
          <ul className="mt-4 flex flex-col gap-1">
            {shortcuts.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
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
          description="Totals across the sections you teach."
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard
            label="Sections"
            value={totalSections}
            icon={<Layers className="h-4 w-4" />}
            hint="Active this term"
            href="/dashboard/professor/courses"
          />
          <StatCard
            label="Live quizzes"
            value={activeQuizzes}
            icon={<FileText className="h-4 w-4" />}
            hint="Open scored work"
            href="/dashboard/professor/courses"
          />
          <StatCard
            label="Attention"
            value={attentionTotalPreview}
            icon={<AlertTriangle className="h-4 w-4" />}
            hint={attentionTotalPreview > 0 ? 'Needs review' : 'Queue clear'}
            href="/dashboard/professor/attention"
            accent={attentionTotalPreview > 0}
          />
          <StatCard
            label="Average"
            value={`${averageScore}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Best per learner per quiz"
            href="/dashboard/professor/quiz-results"
          />
        </div>
      </section>

      <section className="mt-12 flex flex-col gap-4">
        <SectionHeading
          eyebrow="Needs attention"
          title={
            attentionTotalPreview > 0
              ? attentionTotalPreview === 1
                ? '1 response waiting'
                : `${attentionTotalPreview} responses waiting`
              : 'Queue clear'
          }
          actions={
            <Link
              href={appPath('/dashboard/professor/attention')}
              className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Open queue
            </Link>
          }
        />
        {attentionItems.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-rule bg-surface paper-shadow divide-y divide-rule">
            {attentionItems.map((item) => {
              const fullName =
                `${item.student.firstName ?? ''} ${item.student.lastName ?? ''}`.trim() ||
                item.student.email ||
                'Unknown';
              return (
                <li
                  key={item.attemptId}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning-fg shrink-0" />
                      <span className="text-sm font-medium text-ink truncate">
                        {fullName}
                      </span>
                      <span className="text-xs text-ink-faint truncate">
                        · {item.quiz.title}
                      </span>
                    </div>
                    <div className="text-xs text-ink-muted truncate mt-0.5 ml-5">
                      {item.section.name}
                      {item.section.course
                        ? ` · ${item.section.course.title}`
                        : ''}
                      {' · '}
                      {item.manualReviewCount > 0
                        ? `${item.manualReviewCount} manual review`
                        : null}
                      {item.manualReviewCount > 0 && item.pendingCount > 0
                        ? ', '
                        : ''}
                      {item.pendingCount > 0
                        ? `${item.pendingCount} pending`
                        : null}
                      {(item.manualReviewCount > 0 || item.pendingCount > 0) &&
                      item.legacyFallbackCount > 0
                        ? ', '
                        : ''}
                      {item.legacyFallbackCount > 0
                        ? `${item.legacyFallbackCount} legacy fallback`
                        : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button asChild variant="ghost" size="sm">
                      <a
                        href={withBasePath(
                          `/dashboard/professor/attempt/${item.attemptId}`,
                        )}
                      >
                        View
                      </a>
                    </Button>
                    <QuickRegradeButton attemptId={item.attemptId} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted px-1">
            Nothing needs review right now.{' '}
            <a
              href={withBasePath('/dashboard/professor/attention')}
              className="text-brand underline underline-offset-4 decoration-brand-soft hover:decoration-brand"
            >
              Open the full queue
            </a>
            .
          </p>
        )}
      </section>

      <section className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SectionHeading
            eyebrow="Sections"
            title="Where you teach"
            actions={
              <Link
                href={appPath('/dashboard/professor/courses')}
                className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                All courses
              </Link>
            }
          />
          {deskSections.length > 0 ? (
            <ul className="overflow-hidden rounded-xl border border-rule bg-surface paper-shadow divide-y divide-rule">
              {deskSections.map((enrollment) => {
                const section = enrollment.section;
                return (
                  <li
                    key={enrollment.sectionId}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink truncate">
                        {section.course?.id ? (
                          <Link
                            href={appPath(
                              `/dashboard/professor/courses/${section.course.id}`,
                            )}
                            className="hover:text-brand"
                          >
                            {section.course.title}
                          </Link>
                        ) : (
                          (section.course?.title ?? 'Course')
                        )}
                      </div>
                      <div className="text-xs text-ink-muted truncate mt-0.5">
                        {section.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={withBasePath(
                            `/dashboard/professor/sections/${section.id}/gradebook`,
                          )}
                        >
                          Gradebook
                        </a>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={withBasePath(
                            `/dashboard/professor/sections/${section.id}`,
                          )}
                        >
                          Details
                        </a>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted px-1">
              No active sections yet. Join one with an enrollment code above.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeading
            eyebrow="Activity"
            title="Recent submissions"
            actions={
              <Link
                href={appPath('/dashboard/professor/quiz-results')}
                className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                View results
              </Link>
            }
          />
          {recentAttempts.length > 0 ? (
            <ul className="overflow-hidden rounded-xl border border-rule bg-surface paper-shadow divide-y divide-rule">
              {recentAttempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink truncate">
                      {attempt.student.firstName} {attempt.student.lastName}
                    </div>
                    <div className="text-xs text-ink-muted truncate mt-0.5">
                      {attempt.quiz.title} · {attempt.section.course.title}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono tnum text-sm text-ink">
                      {attempt.percentage ?? 0}%
                    </span>
                    <Badge variant={attempt.passed ? 'success' : 'destructive'}>
                      {attempt.passed ? 'Passed' : 'Failed'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted px-1">
              No submissions yet. They’ll appear here as learners finish quizzes.
            </p>
          )}
        </div>
      </section>

      <section className="mt-10 flex flex-col gap-3">
        <SectionHeading
          eyebrow="Export"
          title="Download results"
          description="CSV for quizzes assigned to your sections."
          actions={
            <Link
              href={appPath('/dashboard/professor/agent-access')}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Agent access
            </Link>
          }
        />
        <ExportResultsWrapper quizzes={professorQuizzes} />
      </section>
    </AppShell>
  );
}
