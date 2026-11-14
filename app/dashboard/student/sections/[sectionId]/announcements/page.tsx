import { AnnouncementsPanel } from '@/components/lms/AnnouncementsPanel';
import { SectionHubShell } from '@/components/student/SectionHubShell';
import {
  requireStudentSectionLms,
  studentActiveTool,
} from '@/lib/lms/studentSectionContext';
import { listCourseAnnouncementsDefiner } from '@/lib/db/lmsDefiners';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const { user, ctx, lms } = await requireStudentSectionLms(sectionId);
  const announcements = (await listCourseAnnouncementsDefiner(ctx.courseId))
    .filter((a) => a.publishedAt != null)
    .map((a) => {
      const raw = a.publishedAt ?? a.createdAt ?? null;
      const createdAt =
        raw instanceof Date
          ? raw
          : typeof raw === 'string' || typeof raw === 'number'
            ? new Date(raw)
            : null;
      return {
        id: String(a.id),
        title: String(a.title ?? ''),
        bodyMarkdown: String(a.bodyMarkdown ?? ''),
        createdAt:
          createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
        published: true,
      };
    });

  return (
    <SectionHubShell
      sectionId={ctx.sectionId}
      sectionName={ctx.sectionName}
      courseTitle={ctx.courseTitle}
      activeTab={studentActiveTool('announcements', lms.enabled)}
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
      description="Course announcements"
    >
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-2xl text-ink">Announcements</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Updates from your instructor for this course.
          </p>
        </div>
        <AnnouncementsPanel
          courseId={ctx.courseId}
          announcements={announcements}
          studentPreview
        />
      </div>
    </SectionHubShell>
  );
}
