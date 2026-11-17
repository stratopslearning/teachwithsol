import { notFound } from 'next/navigation';

import { hasActiveSupportAccess } from '@/lib/authz/supportAccess';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import ExportResultsWrapper from '@/components/ExportResultsWrapper';
import { SectionGradebookTable } from '@/components/sections/SectionGradebookTable';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { EmptyState } from '@/components/patterns/EmptyState';
import { requireAdmin } from '@/lib/auth';
import { withBasePath } from '@/lib/basePath';
import { loadSectionGradebookMatrix } from '@/lib/professor/sectionGradebookMatrix';

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

  // Same matrix as the professor gradebook (it also logs the access).
  const matrix = await loadSectionGradebookMatrix({ sectionId, actor: admin });
  if (!matrix) return notFound();
  const { learners, quizzes: sectionQuizzes } = matrix;
  const section = {
    id: matrix.sectionId,
    name: matrix.sectionName,
    course: matrix.courseTitle ? { title: matrix.courseTitle } : null,
  };

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
            ? `${section.course.title} · ${learners.length} learners · ${sectionQuizzes.length} quizzes`
            : `${learners.length} learners · ${sectionQuizzes.length} quizzes`
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
          {learners.length === 0 || sectionQuizzes.length === 0 ? (
            <EmptyState
              eyebrow="Empty"
              title={
                learners.length === 0
                  ? 'No learners enrolled.'
                  : 'No quizzes assigned to this section.'
              }
              description={
                learners.length === 0
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
