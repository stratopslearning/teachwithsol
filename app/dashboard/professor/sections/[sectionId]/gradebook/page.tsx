import { notFound } from 'next/navigation';

import ExportResultsWrapper from '@/components/ExportResultsWrapper';
import { SectionGradebookTable } from '@/components/sections/SectionGradebookTable';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { EmptyState } from '@/components/patterns/EmptyState';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { withBasePath } from '@/lib/basePath';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import { assertTeachesSection } from '@/lib/professor/sections';
import { loadSectionGradebookMatrix } from '@/lib/professor/sectionGradebookMatrix';

export default async function SectionGradebookPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;

  const me = await requireTeachingAccess();
  try {
    await assertTeachesSection(me, sectionId);
  } catch {
    return notFound();
  }

  const [matrix, sectionMeta] = await Promise.all([
    loadSectionGradebookMatrix({ sectionId, actor: me }),
    fetchSectionById(sectionId),
  ]);
  if (!matrix || !sectionMeta || sectionMeta.deletedAt) return notFound();

  const { learners, quizzes, completionColumns, sectionName, courseTitle } =
    matrix;
  const studentsEmpty = learners.length === 0;
  const workEmpty = quizzes.length === 0 && completionColumns.length === 0;

  return (
    <AppShell
      role="professor"
      active="courses"
      topbarTitle="Gradebook"
      maxWidth="wide"
    >
      <PageHeader
        breadcrumbs={[
          {
            label: 'Courses',
            href: withBasePath('/dashboard/professor/courses'),
          },
          ...(courseTitle && sectionMeta.courseId
            ? [
                {
                  label: courseTitle,
                  href: withBasePath(
                    `/dashboard/professor/courses/${sectionMeta.courseId}/grades`,
                  ),
                },
              ]
            : []),
          {
            label: sectionName,
            href: withBasePath(`/dashboard/professor/sections/${sectionId}`),
          },
          { label: 'Gradebook' },
        ]}
        eyebrow="Gradebook"
        title={`${sectionName} grades`}
        description={
          courseTitle
            ? `${courseTitle} · ${learners.length} learners · ${quizzes.length} quizzes · ${completionColumns.length} completion activities`
            : `${learners.length} learners · ${quizzes.length} quizzes · ${completionColumns.length} completion activities`
        }
        actions={
          quizzes.length > 0 ? (
            <ExportResultsWrapper quizzes={quizzes} />
          ) : undefined
        }
      />

      <section className="mt-12">
        <SectionHeading eyebrow="Matrix" title="Best score per learner" />
        <div className="mt-6">
          {studentsEmpty || workEmpty ? (
            <EmptyState
              eyebrow="Empty"
              title={
                studentsEmpty
                  ? 'No learners enrolled.'
                  : 'No assignments in this section yet.'
              }
              description={
                studentsEmpty
                  ? 'Share the learner enrolment code on the section detail page.'
                  : 'Assign a quiz, lesson, discussion, or interactive to start the gradebook.'
              }
            />
          ) : (
            <SectionGradebookTable
              learners={learners}
              quizzes={quizzes}
              completionColumns={completionColumns}
            />
          )}
        </div>
      </section>
    </AppShell>
  );
}
