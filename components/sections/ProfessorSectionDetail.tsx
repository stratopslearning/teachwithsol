import { AssignActivityToSectionDialog } from '@/components/sections/AssignActivityToSectionDialog';
import { CanvasLinkPanel } from '@/components/sections/CanvasLinkPanel';
import { SectionDetailView } from '@/components/sections/SectionDetailView';
import LeaveSectionButton from '@/app/dashboard/professor/sections/[sectionId]/LeaveSectionButton';
import UnassignDiscussionButton from '@/app/dashboard/professor/sections/[sectionId]/UnassignDiscussionButton';
import UnassignQuizButton from '@/app/dashboard/professor/sections/[sectionId]/UnassignQuizButton';
import { listCourseActivities } from '@/lib/assignments';
import { entityIdForActivity } from '@/lib/professor/activityEntity';
import type { SectionDetailData } from '@/lib/sectionDetailData';

/**
 * Shared section roster / invites / coursework body used by the course hub
 * and (via redirect) the legacy standalone section URL.
 */
export async function ProfessorSectionDetail({
  sectionId,
  data,
  gradebookHref,
}: {
  sectionId: string;
  data: SectionDetailData;
  /** Override gradebook link (defaults to legacy section gradebook). */
  gradebookHref?: string;
}) {
  const courseId = data.section.course?.id;

  const courseActivities = courseId
    ? await listCourseActivities({ courseId })
    : [];
  const assignableSeen = new Set<string>();
  const assignableActivities: Array<{
    type: 'QUIZ' | 'DISCUSSION' | 'INTERACTIVE';
    entityId: string;
    title: string;
    assigned: boolean;
  }> = [];
  for (const a of courseActivities) {
    if (
      a.type !== 'QUIZ' &&
      a.type !== 'DISCUSSION' &&
      a.type !== 'INTERACTIVE'
    ) {
      continue;
    }
    const entityId = entityIdForActivity(a);
    if (!entityId) continue;
    const key = `${a.type}:${entityId}`;
    if (assignableSeen.has(key)) continue;
    assignableSeen.add(key);
    assignableActivities.push({
      type: a.type,
      entityId,
      title: a.title,
      assigned: a.sectionIds.includes(sectionId),
    });
  }

  return (
    <>
      <SectionDetailView
        data={data}
        role="professor"
        sectionId={sectionId}
        gradebookHref={gradebookHref}
        enrollmentActions={<LeaveSectionButton sectionId={data.section.id} />}
        courseworkActions={
          courseId ? (
            <AssignActivityToSectionDialog
              sectionId={sectionId}
              sectionName={data.section.name}
              activities={assignableActivities}
            />
          ) : null
        }
        quizRowActions={(quizId) => (
          <UnassignQuizButton quizId={quizId} sectionId={sectionId} />
        )}
        discussionRowActions={(chatbotId) => (
          <UnassignDiscussionButton
            chatbotId={chatbotId}
            sectionId={sectionId}
          />
        )}
      />
      <CanvasLinkPanel sectionId={sectionId} />
    </>
  );
}
