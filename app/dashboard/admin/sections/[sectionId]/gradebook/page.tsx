import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { hasActiveSupportAccess } from '@/lib/authz/supportAccess';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import { withTenant } from '@/lib/db/tenantContext';
import {
  quizSections,
  sections,
  studentSections,
} from '@/app/db/schema';
import ExportResultsWrapper from '@/components/ExportResultsWrapper';
import { SectionGradebookTable } from '@/components/sections/SectionGradebookTable';
import type { GradebookLearnerRow } from '@/components/sections/SectionGradebookTable';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { EmptyState } from '@/components/patterns/EmptyState';
import { logGradebookAccess } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth';
import { withBasePath } from '@/lib/basePath';
import { activeOnly } from '@/lib/db/filters';
import { comparePersonsByLastName } from '@/lib/personName';
import { buildGradebookScoresForSection } from '@/lib/professorVisibleAttempts';

export default async function AdminSectionGradebookPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const admin = await requireAdmin();
  const { sectionId } = await params;

  // FORCE RLS: plain db reads return nothing. Resolve the section's tenant via
  // the definer; grades are student records, so platform staff need an active
  // support grant for that tenant (no global bypass).
  const sectionMeta = await fetchSectionById(sectionId);
  const tenantId = sectionMeta?.tenantId ?? sectionMeta?.workspaceId;
  if (!tenantId || !(await hasActiveSupportAccess(admin.id, tenantId))) {
    return notFound();
  }

  await logGradebookAccess({
    actorUserId: admin.id,
    actorClerkId: admin.clerkId,
    sectionId,
    role: 'ADMIN',
  });

  const { section, studentEnrollments, quizSectionAssignments } = await withTenant(
    tenantId,
    admin.id,
    async (tx) => ({
      section: await tx.query.sections.findFirst({
        where: and(eq(sections.id, sectionId), activeOnly(sections.deletedAt)),
        with: { course: true },
      }),
      studentEnrollments: await tx.query.studentSections.findMany({
        where: and(
          eq(studentSections.sectionId, sectionId),
          eq(studentSections.status, 'ACTIVE'),
        ),
        with: { student: true },
      }),
      quizSectionAssignments: await tx.query.quizSections.findMany({
        where: eq(quizSections.sectionId, sectionId),
        with: { quiz: true },
      }),
    }),
  );
  if (!section) return notFound();

  const students = studentEnrollments
    .map((e) => e.student)
    .sort((a, b) => comparePersonsByLastName(a, b));

  const sectionQuizzes = quizSectionAssignments
    .map((qs) => qs.quiz)
    .filter((q): q is NonNullable<(typeof quizSectionAssignments)[0]['quiz']> =>
      q != null && q.deletedAt == null,
    );
  const quizIds = sectionQuizzes.map((q) => q.id);

  const studentQuizScores = await buildGradebookScoresForSection({
    sectionId,
    quizIds,
    enrolledStudentIds: students.map((s) => s.id),
  });

  const learners: GradebookLearnerRow[] = students.map((student) => {
    const bestPercentages = sectionQuizzes
      .map((quiz) => studentQuizScores[student.id]?.[quiz.id]?.percentage)
      .filter((p): p is number => p != null);
    const average =
      bestPercentages.length > 0
        ? Math.round(
            bestPercentages.reduce((sum, p) => sum + p, 0) /
              bestPercentages.length,
          )
        : null;

    const cells: GradebookLearnerRow['cells'] = {};
    for (const quiz of sectionQuizzes) {
      const cell = studentQuizScores[student.id]?.[quiz.id];
      if (cell) cells[quiz.id] = cell;
    }

    return {
      id: student.id,
      person: {
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
      },
      cells,
      average,
    };
  });

  return (
    <AppShell
      role="admin"
      active="workspaces"
      topbarTitle="Gradebook"
      maxWidth="wide"
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Overview', href: withBasePath('/dashboard/admin') },
          {
            label: 'Sections',
            href: withBasePath('/dashboard/admin/sections'),
          },
          {
            label: section.name,
            href: withBasePath(`/dashboard/admin/sections/${section.id}`),
          },
          { label: 'Gradebook' },
        ]}
        eyebrow="Gradebook"
        title={`${section.name} grades`}
        description={
          section.course
            ? `${section.course.title} · ${students.length} learners · ${sectionQuizzes.length} quizzes`
            : `${students.length} learners · ${sectionQuizzes.length} quizzes`
        }
        actions={
          sectionQuizzes.length > 0 ? (
            <ExportResultsWrapper
              quizzes={sectionQuizzes.map((q) => ({
                id: q.id,
                title: q.title,
              }))}
            />
          ) : undefined
        }
      />

      <section className="mt-12">
        <SectionHeading eyebrow="Matrix" title="Best score per learner" />
        <div className="mt-6">
          {students.length === 0 || sectionQuizzes.length === 0 ? (
            <EmptyState
              eyebrow="Empty"
              title={
                students.length === 0
                  ? 'No learners enrolled.'
                  : 'No quizzes assigned to this section.'
              }
              description={
                students.length === 0
                  ? 'Share the learner enrolment code on the section detail page.'
                  : 'Assign at least one quiz to start collecting grades.'
              }
            />
          ) : (
            <SectionGradebookTable
              learners={learners}
              quizzes={sectionQuizzes.map((q) => ({ id: q.id, title: q.title }))}
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}
