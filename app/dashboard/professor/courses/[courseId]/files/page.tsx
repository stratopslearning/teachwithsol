import { FilesPanel } from '@/components/lms/FilesPanel';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import { listCourseMaterials } from '@/lib/knowledge';
import {
  facultyActiveTool,
  requireFacultyCourse,
} from '@/lib/lms/facultyCourseContext';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { courseId } = await params;
  const studentView = (await searchParams).as === 'student';
  const { user, course, lms } = await requireFacultyCourse(courseId);
  const materials = await listCourseMaterials(user, courseId);
  return (
    <CourseHubShell
      courseId={courseId}
      courseTitle={course.title}
      activeTab={facultyActiveTool('files', lms.enabled)}
      tools={lms.enabled ? lms.facultyTools : undefined}
      nav={lms.nav}
      studentView={studentView}
    >
      <FilesPanel
        courseId={courseId}
        studentPreview={studentView}
        files={materials.map((m) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          createdAt: m.createdAt ?? null,
          byteSize: m.byteSize ?? null,
        }))}
      />
    </CourseHubShell>
  );
}
