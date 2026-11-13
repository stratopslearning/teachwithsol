import { notFound } from 'next/navigation';

import MaterialsClient from '@/app/dashboard/professor/materials/[courseId]/MaterialsClient';
import { ProfessorToolCourseShell } from '@/components/professor/ProfessorToolCourseShell';
import {
  consolidateCourseBookKnowledge,
  listCourseBooks,
} from '@/lib/books';
import { requireTeachingAccess } from '@/lib/authz/gates';
import {
  assertCanManageCourse,
  listCourseLinkedDocuments,
  listCourseMaterials,
  listTeachableCourses,
  listWorkspaceDocuments,
} from '@/lib/knowledge';
import { getCourseWorkspaceId } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function ProfessorMaterialsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const user = await requireTeachingAccess();

  const { courseId } = await params;
  let course: { id: string; title: string };
  try {
    course = await assertCanManageCourse(user, courseId);
  } catch {
    notFound();
  }

  try {
    await consolidateCourseBookKnowledge(courseId);
  } catch (err) {
    console.warn('[materials] consolidate failed', err);
  }

  const workspaceId = await getCourseWorkspaceId(courseId);
  const [materials, books, linkedDocuments, libraryDocuments, teachable] =
    await Promise.all([
      listCourseMaterials(user, courseId),
      listCourseBooks(user, courseId),
      listCourseLinkedDocuments(user, courseId),
      workspaceId
        ? listWorkspaceDocuments(user, workspaceId).catch((err) => {
            console.warn('[materials] workspace library list failed', err);
            return [];
          })
        : Promise.resolve([]),
      listTeachableCourses(user),
    ]);

  const linkedIds = new Set(linkedDocuments.map((d) => d.id));
  const attachableDocuments = libraryDocuments.filter(
    (d) => !linkedIds.has(d.id) && d.status === 'READY',
  );

  return (
    <ProfessorToolCourseShell
      active="knowledge"
      toolLabel="Materials"
      toolHref="/dashboard/professor/materials"
      courseId={courseId}
      courseTitle={course.title}
      description="Files, links, and books for this course — grounds the tutor and authoring."
      teachable={teachable}
      hrefTemplate="/dashboard/professor/materials/{courseId}"
    >
      <MaterialsClient
        courseId={courseId}
        workspaceId={workspaceId}
        initialMaterials={materials}
        initialBooks={books}
        initialLinkedDocuments={linkedDocuments}
        attachableDocuments={attachableDocuments}
      />
    </ProfessorToolCourseShell>
  );
}
