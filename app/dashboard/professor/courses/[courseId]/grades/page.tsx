import { GradesPanel } from '@/components/lms/GradesPanel';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import {
  facultyActiveTool,
  requireFacultyCourse,
} from '@/lib/lms/facultyCourseContext';
import { loadSectionGradebookMatrix } from '@/lib/professor/sectionGradebookMatrix';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ as?: string; section?: string }>;
}) {
  const { courseId } = await params;
  const sp = await searchParams;
  const studentView = sp.as === 'student';
  const { user, course, lms } = await requireFacultyCourse(courseId);
  const sectionIds = await listTeachableSectionIdsForCourse(user, courseId);
  const sections = sectionIds.length
    ? await fetchSectionsByIds(sectionIds)
    : [];
  const sectionRows = sections.map((s) => ({ id: s.id, name: s.name }));
  const selectedSectionId =
    (sp.section && sectionRows.some((s) => s.id === sp.section)
      ? sp.section
      : null) ??
    sectionRows[0]?.id ??
    null;

  const matrix = selectedSectionId
    ? await loadSectionGradebookMatrix({
        sectionId: selectedSectionId,
        actor: user,
      })
    : null;

  return (
    <CourseHubShell
      courseId={courseId}
      courseTitle={course.title}
      activeTab={facultyActiveTool('grades', lms.enabled)}
      tools={lms.enabled ? lms.facultyTools : undefined}
      nav={lms.nav}
      studentView={studentView}
    >
      <GradesPanel
        courseId={courseId}
        studentPreview={studentView}
        sections={sectionRows}
        selectedSectionId={selectedSectionId}
        matrix={
          matrix
            ? {
                learners: matrix.learners,
                quizzes: matrix.quizzes,
                completionColumns: matrix.completionColumns,
              }
            : null
        }
      />
    </CourseHubShell>
  );
}
