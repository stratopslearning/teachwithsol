import { StudentFilesClient } from '@/components/student/StudentFilesClient';
import { SectionHubShell } from '@/components/student/SectionHubShell';
import { listStudentBooks } from '@/lib/books';
import {
  requireStudentSectionLms,
  studentActiveTool,
} from '@/lib/lms/studentSectionContext';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const { user, ctx, lms } = await requireStudentSectionLms(sectionId);
  const books = await listStudentBooks(user.id, { sectionId });

  return (
    <SectionHubShell
      sectionId={ctx.sectionId}
      sectionName={ctx.sectionName}
      courseTitle={ctx.courseTitle}
      activeTab={studentActiveTool('files', lms.enabled)}
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
      description="Course files and released books"
    >
      <StudentFilesClient books={books} />
    </SectionHubShell>
  );
}
