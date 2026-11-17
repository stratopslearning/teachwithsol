import { requireTeachingAccess } from '@/lib/authz/gates';

import { loadOwnedDiscussionForEdit } from '@/lib/data/pages/professorDiscussions';
import { listDiscussionQuizOptions } from '@/lib/professor/discussionQuizOptions';
import { ChatbotCreationForm } from '@/components/chatbot/ChatbotCreationForm';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { withBasePath } from '@/lib/basePath';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { appRedirect } from '@/lib/serverRedirect';
import {
  isSectionConcluded,
  partitionEnrollmentsByConclusion,
} from '@/lib/sectionAvailability';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDiscussionPage(props: PageProps) {
  const user = await requireTeachingAccess();

  const { id } = await props.params;
  const bot = await loadOwnedDiscussionForEdit(id, user.id);
  if (!bot || bot.isTemplate) {
    appRedirect('/dashboard/professor/discussions');
  }

  const { listTeachingSectionIds } = await import(
    '@/lib/professor/graderSections'
  );
  const { fetchSectionsByIds } = await import('@/lib/db/entityScopedReads');
  const teachingIds = await listTeachingSectionIds(user);
  const sectionRows = teachingIds.length
    ? await fetchSectionsByIds(teachingIds)
    : [];
  const professorSectionsList = sectionRows.map((section) => ({
    section: {
      id: section.id,
      name: section.name,
      endsAt: section.endsAt,
      createdAt: new Date(),
      courseId: section.courseId,
      course: section.course ?? {
        id: section.courseId,
        title: 'Course',
        description: null,
      },
    },
    sectionId: section.id,
    enrolledAt: new Date(),
  }));

  const assignedIdSet = new Set(
    bot.sectionAssignments.map((s) => s.sectionId),
  );
  const sectionOptionsSource = professorSectionsList.filter(
    (ps) =>
      !isSectionConcluded(ps.section) || assignedIdSet.has(ps.section.id),
  );

  const enrolledSections = sectionOptionsSource.map((ps) => ({
    id: ps.section.id,
    title: `${ps.section.course.title} - ${ps.section.name}`,
  }));

  const { active: ongoingEnrollments } =
    partitionEnrollmentsByConclusion(professorSectionsList);
  const enrolledSectionIds = ongoingEnrollments.map((ps) => ps.sectionId);
  const quizMap = await listDiscussionQuizOptions(user.id, enrolledSectionIds);

  return (
    <AppShell
      role="professor"
      active="assignments"
      topbarTitle="Edit discussion"
      maxWidth="narrow"
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: withBasePath('/dashboard/professor') },
          {
            label: 'Assignments',
            href: withBasePath('/dashboard/professor/assignments'),
          },
          { label: 'Edit' },
        ]}
        eyebrow="Edit"
        title={bot.title}
        description="Update the flow, quiz link, or section assignments."
      />
      <div className="mt-10">
        <ChatbotCreationForm
          sections={enrolledSections}
          quizzes={Array.from(quizMap.values(), ({ id, title }) => ({ id, title }))}
          initial={{
            id: bot.id,
            title: bot.title,
            description: bot.description ?? undefined,
            personaName: bot.personaName,
            instructions: bot.instructions,
            systemPrompt: bot.systemPrompt,
            relatedQuizId: bot.relatedQuizId,
            sectionIds: bot.sectionAssignments.map((s) => s.sectionId),
            aiPolicyMode: bot.aiPolicy?.mode ?? null,
          }}
        />
      </div>
    </AppShell>
  );
}
