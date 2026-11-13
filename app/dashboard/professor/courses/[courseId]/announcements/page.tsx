import { AnnouncementsPanel } from '@/components/lms/AnnouncementsPanel';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import {
  facultyActiveTool,
  requireFacultyCourse,
} from '@/lib/lms/facultyCourseContext';
import { listCourseAnnouncementsDefiner } from '@/lib/db/lmsDefiners';

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
  const { course, lms } = await requireFacultyCourse(courseId);
  const announcements = await listCourseAnnouncementsDefiner(courseId);
  return (
    <CourseHubShell
      courseId={courseId}
      courseTitle={course.title}
      activeTab={facultyActiveTool('announcements', lms.enabled)}
      tools={lms.enabled ? lms.facultyTools : undefined}
      nav={lms.nav}
      studentView={studentView}
    >
      <AnnouncementsPanel
        courseId={courseId}
        studentPreview={studentView}
        announcements={announcements.map((a) => ({
          id: String(a.id),
          title: String(a.title),
          bodyMarkdown: String(a.bodyMarkdown ?? ''),
          createdAt: (a as { createdAt?: Date | string | null }).createdAt ?? null,
          published: Boolean((a as { published?: boolean }).published),
        }))}
      />
    </CourseHubShell>
  );
}
