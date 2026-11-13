import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  BookOpen,
  ClipboardList,
  Layers,
  PenLine,
  TrendingUp,
  Users,
} from '@/components/icons';

import { CopyFromOfferingDialog } from '@/components/professor/CopyFromOfferingDialog';
import { CourseTutorPolicyCard } from '@/components/professor/CourseTutorPolicyCard';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { StatCard } from '@/components/patterns/StatCard';
import { QuickRegradeButton } from '@/components/quiz/QuickRegradeButton';
import { Button } from '@/components/ui/button';
import { getCourseAnalytics } from '@/lib/analytics';
import { listCourseActivities } from '@/lib/assignments';
import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import { listCopySourceOfferings } from '@/lib/authoring/copySources';
import { listOutlinesForCourse } from '@/lib/authoring/outlines';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { appPath, withBasePath } from '@/lib/basePath';
import { parseAiPolicy } from '@/lib/chatbot/aiPolicy';
import { fetchCourseHubMeta } from '@/lib/db/entityScopedReads';
import {
  fetchRecentAttemptsForSections,
  fetchSectionLearnerCounts,
} from '@/lib/db/facultyStudentReads';
import { TeachingPaywallBanner } from '@/components/workspace/TeachingPaywallBanner';
import { assertCanManageCourse, listCourseMaterials } from '@/lib/knowledge';
import { loadCourseNav } from '@/lib/lms/loadCourseNav';
import { getAttentionItemsForProfessor } from '@/lib/professorAttention';
import { assertWorkspaceAllowsTeaching } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

function formatWhen(d: Date | string | null | undefined) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function ProfessorCourseHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const user = await requireTeachingAccess();

  const { courseId } = await params;
  const studentView = (await searchParams).as === 'student';
  let course: { id: string; title: string; workspaceId: string | null };
  try {
    course = await assertCanManageCourse(user, courseId);
  } catch {
    notFound();
  }

  const teachingEntitlement = course.workspaceId
    ? await assertWorkspaceAllowsTeaching(course.workspaceId)
    : { ok: true as const };

  const sectionIds = await listTeachableSectionIdsForCourse(user, courseId);
  const base = `/dashboard/professor/courses/${courseId}`;

  const [
    hub,
    copySources,
    activities,
    learnerCounts,
    attentionItems,
    recentAttemptRows,
    outlines,
    materials,
    analytics,
    lms,
  ] = await Promise.all([
    fetchCourseHubMeta(courseId),
    listCopySourceOfferings(user, courseId),
    listCourseActivities({ courseId }),
    fetchSectionLearnerCounts(sectionIds),
    getAttentionItemsForProfessor(user.id, {
      sectionIds,
      limit: 6,
    }),
    fetchRecentAttemptsForSections(sectionIds, 6),
    listOutlinesForCourse(user, courseId),
    listCourseMaterials(user, courseId),
    getCourseAnalytics(user, courseId, { audit: false }),
    loadCourseNav(courseId),
  ]);

  const sectionCount = hub?.sectionCount ?? sectionIds.length;
  const studentCount = [...learnerCounts.values()].reduce((a, b) => a + b, 0);

  const readyMaterials = materials.filter((m) => m.status === 'READY').length;
  const failedMaterials = materials.filter((m) => m.status === 'FAILED').length;
  const processingMaterials = materials.filter(
    (m) => m.status === 'PENDING' || m.status === 'PROCESSING',
  ).length;
  const materialTotal = materials.length;

  const liveActivities = activities.filter((a) => a.isActive).length;
  const quizCount = activities.filter((a) => a.type === 'QUIZ').length;
  const discussionCount = activities.filter(
    (a) => a.type === 'DISCUSSION',
  ).length;

  const attentionTotal = attentionItems.reduce(
    (s, i) => s + i.needsAttentionCount,
    0,
  );

  const outline = outlines[0] ?? null;
  const outlineLabel = outline
    ? outline.status === 'READY'
      ? 'Ready'
      : outline.status === 'DRAFT'
        ? 'Draft'
        : outline.status
    : 'None yet';

  const tagPct = analytics.tagCoverage.percent;
  const gapCount = analytics.gapCount;
  const lessonCompletion = analytics.avgLessonCompletionRate;

  return (
    <CourseHubShell
      courseId={courseId}
      courseTitle={course.title}
      description="Enrollment, materials, live work, and what needs your attention."
      activeTab={lms.enabled ? 'home' : 'overview'}
      tools={lms.enabled ? lms.facultyTools : undefined}
      nav={lms.nav}
      studentView={studentView}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <CopyFromOfferingDialog
            targetCourseId={courseId}
            targetOfferingId={copySources.targetOfferingId}
            sources={copySources.sources}
          />
          <Button asChild>
            <Link href={appPath(`${base}/sections`)}>Sections</Link>
          </Button>
        </div>
      }
    >
      {course.workspaceId &&
      !teachingEntitlement.ok &&
      teachingEntitlement.code === 'billing_required' ? (
        <div className="mb-6">
          <TeachingPaywallBanner
            workspaceId={course.workspaceId}
            reason={teachingEntitlement.reason}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Students"
          value={studentCount}
          hint={
            sectionCount === 0
              ? 'No sections yet'
              : `${sectionCount} section${sectionCount === 1 ? '' : 's'}`
          }
          icon={<Users className="h-4 w-4" />}
          href={`${base}/sections`}
        />
        <StatCard
          label="Materials"
          value={materialTotal}
          hint={
            failedMaterials > 0
              ? `${failedMaterials} failed · ${readyMaterials} ready`
              : processingMaterials > 0
                ? `${processingMaterials} indexing · ${readyMaterials} ready`
                : `${readyMaterials} ready for authoring`
          }
          icon={<BookOpen className="h-4 w-4" />}
          href={appPath(`/dashboard/professor/materials/${courseId}`)}
          accent={failedMaterials > 0}
        />
        <StatCard
          label="Live"
          value={liveActivities}
          hint={
            activities.length === 0
              ? 'No assignments yet'
              : `${quizCount} quiz${quizCount === 1 ? '' : 'zes'} · ${discussionCount} discussion${discussionCount === 1 ? '' : 's'}`
          }
          icon={<ClipboardList className="h-4 w-4" />}
          href={appPath(`/dashboard/professor/assignments/${courseId}`)}
        />
        <StatCard
          label="Attention"
          value={attentionTotal}
          hint={attentionTotal > 0 ? 'Needs review' : 'Queue clear'}
          icon={<AlertTriangle className="h-4 w-4" />}
          href={appPath('/dashboard/professor/attention')}
          accent={attentionTotal > 0}
        />
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <SectionHeading
            eyebrow="Grading"
            title={
              attentionTotal > 0
                ? attentionTotal === 1
                  ? '1 response waiting'
                  : `${attentionTotal} responses waiting`
                : 'Queue clear'
            }
            actions={
              <Link
                href={appPath('/dashboard/professor/attention')}
                className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Full queue
              </Link>
            }
          />
          {attentionItems.length > 0 ? (
            <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface paper-shadow">
              {attentionItems.map((item) => {
                const fullName =
                  `${item.student.firstName ?? ''} ${item.student.lastName ?? ''}`.trim() ||
                  item.student.email ||
                  'Unknown';
                return (
                  <li
                    key={item.attemptId}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-fg" />
                        <span className="truncate text-sm font-medium text-ink">
                          {fullName}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate pl-5 text-xs text-ink-muted">
                        {item.quiz.title}
                        {item.section.name ? ` · ${item.section.name}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
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
            <p className="px-1 text-sm text-ink-muted">
              Nothing in this course needs review right now.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeading
            eyebrow="Activity"
            title="Recent submissions"
          />
          {recentAttemptRows.length > 0 ? (
            <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface paper-shadow">
              {recentAttemptRows.map((attempt) => {
                const name =
                  attempt.student.firstName || attempt.student.lastName
                    ? `${attempt.student.firstName ?? ''} ${attempt.student.lastName ?? ''}`.trim()
                    : attempt.student.email;
                const pct =
                  attempt.percentage != null
                    ? `${Math.round(attempt.percentage)}%`
                    : '—';
                return (
                  <li
                    key={attempt.id}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {attempt.quiz.title}
                        {attempt.section.name
                          ? ` · ${attempt.section.name}`
                          : ''}
                        {attempt.submittedAt
                          ? ` · ${formatWhen(attempt.submittedAt)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tnum text-sm font-medium text-ink">
                        {pct}
                      </span>
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={withBasePath(
                            `/dashboard/professor/attempt/${attempt.id}`,
                          )}
                        >
                          View
                        </a>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-1 text-sm text-ink-muted">
              No submissions in this course yet.
            </p>
          )}
        </section>
      </div>

      <section className="mt-12 flex flex-col gap-4">
        <SectionHeading
          eyebrow="Course pulse"
          title="Authoring & learning"
          description="Outline status and how students are doing against tagged concepts."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href={appPath(`/dashboard/professor/authoring/${courseId}`)}
            className="group flex flex-col gap-2 rounded-xl border border-rule bg-surface px-4 py-4 paper-shadow transition-colors hover:border-rule-strong"
          >
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
              <PenLine className="h-3.5 w-3.5" />
              Outline
            </span>
            <span className="font-display text-xl text-ink">{outlineLabel}</span>
            <span className="text-xs text-ink-muted">
              {outline
                ? outline.title || 'Untitled outline'
                : 'Start drafting from materials'}
            </span>
          </Link>
          <div className="flex flex-col gap-2 rounded-xl border border-rule bg-surface px-4 py-4 paper-shadow">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
              <TrendingUp className="h-3.5 w-3.5" />
              Tag coverage
            </span>
            <span className="font-display text-xl text-ink tnum">{tagPct}%</span>
            <span className="text-xs text-ink-muted">
              {analytics.tagCoverage.taggedQuestions}/
              {analytics.tagCoverage.totalQuestions} questions tagged
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-rule bg-surface px-4 py-4 paper-shadow">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
              <AlertTriangle className="h-3.5 w-3.5" />
              Concept gaps
            </span>
            <span className="font-display text-xl text-ink tnum">{gapCount}</span>
            <span className="text-xs text-ink-muted">
              {gapCount === 0
                ? 'No low-success concepts'
                : 'Below success threshold'}
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-rule bg-surface px-4 py-4 paper-shadow">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
              <Layers className="h-3.5 w-3.5" />
              Lessons
            </span>
            <span className="font-display text-xl text-ink tnum">
              {lessonCompletion}%
            </span>
            <span className="text-xs text-ink-muted">
              Avg completion across released lessons
            </span>
          </div>
        </div>
      </section>

      <div className="mt-12 max-w-xl">
        <CourseTutorPolicyCard
          courseId={courseId}
          initialMode={parseAiPolicy(hub?.aiPolicy)?.mode ?? null}
        />
      </div>
    </CourseHubShell>
  );
}
