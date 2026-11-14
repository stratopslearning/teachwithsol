import { StudentModulesClient } from '@/components/lms/StudentModulesClient';
import { SectionHubShell } from '@/components/student/SectionHubShell';
import {
  requireStudentSectionLms,
  studentActiveTool,
} from '@/lib/lms/studentSectionContext';
import { loadStudentModulesView } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  const { user, ctx, lms } = await requireStudentSectionLms(sectionId);
  const modules = await loadStudentModulesView({
    courseId: ctx.courseId,
    studentId: user.id,
  });
  return (
    <SectionHubShell
      sectionId={ctx.sectionId}
      sectionName={ctx.sectionName}
      courseTitle={ctx.courseTitle}
      activeTab={studentActiveTool('modules', lms.enabled)}
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
      description="Weekly modules and learning path"
    >
      <StudentModulesClient
        sectionId={sectionId}
        modules={modules.map((m) => ({
          id: m.id,
          title: m.title,
          locked: m.locked,
          lockReason: m.lockReason ?? null,
          prerequisiteModuleIds: m.prerequisiteModuleIds,
          items: m.items.map((i) => ({
            id: i.id,
            title: i.title,
            type: i.type,
            isHeader: i.isHeader,
            quizId: i.quizId,
            lessonId: i.lessonId,
            chatbotId: i.chatbotId,
            interactiveId: i.interactiveId,
            pageId: i.pageId,
            externalUrl: i.externalUrl,
            completionRequirement: i.completionRequirement,
            completed: Boolean(i.completed),
          })),
        }))}
      />
    </SectionHubShell>
  );
}
