import { requireTeachingAccess } from '@/lib/authz/gates';

import { listDiscussionQuizOptions } from '@/lib/professor/discussionQuizOptions';
import { ChatbotCreationForm } from '@/components/chatbot/ChatbotCreationForm';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { withBasePath } from '@/lib/basePath';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { partitionEnrollmentsByConclusion } from '@/lib/sections/availability';
import { listTeachingSectionIds } from '@/lib/professor/graderSections';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';

interface PageProps {
  searchParams: Promise<{ quizId?: string; courseId?: string }>;
}

export default async function NewDiscussionPage(props: PageProps) {
  const user = await requireTeachingAccess();

  const { quizId, courseId } = await props.searchParams;

  const teachingIds = await listTeachingSectionIds(user);
  const sectionRows = teachingIds.length ? await fetchSectionsByIds(teachingIds) : [];
  const professorSectionsList = sectionRows.map((section) => ({
    section: {
      id: section.id,
      name: section.name,
      endsAt: section.endsAt,
      createdAt: new Date(),
      courseId: section.courseId,
      course: section.course ?? { id: section.courseId, title: 'Course', description: null },
    },
    enrolledAt: new Date(),
  }));
  const { active: ongoingEnrollments } =
    partitionEnrollmentsByConclusion(professorSectionsList);

  let enrolledSections = ongoingEnrollments.map((ps) => ({
    id: ps.section.id,
    title: `${ps.section.course.title} - ${ps.section.name}`,
    courseId: ps.section.courseId,
  }));

  let backHref = withBasePath('/dashboard/professor/courses');
  let backLabel = 'Courses';
  let defaultSectionIds: string[] | undefined;

  if (courseId) {
    enrolledSections = enrolledSections.filter((s) => s.courseId === courseId);
    defaultSectionIds = enrolledSections.map((s) => s.id);
    backHref = withBasePath(
      `/dashboard/professor/courses/${courseId}/assignments`,
    );
    backLabel = 'Course assignments';
  }

  const enrolledSectionIds = enrolledSections.map((s) => s.id);

  const quizMap = await listDiscussionQuizOptions(user.id, enrolledSectionIds);
  const quizOptions = Array.from(quizMap.values(), ({ id, title }) => ({ id, title })).sort(
    (a, b) => a.title.localeCompare(b.title),
  );

  let initial:
    | {
        title?: string;
        description?: string;
        relatedQuizId?: string | null;
        sectionIds?: string[];
      }
    | undefined;

  if (quizId) {
    const quiz = quizMap.get(quizId);
    if (quiz) {
      initial = {
        title: `${quiz.title} Discussion`,
        description: quiz.description ?? undefined,
        relatedQuizId: quizId,
        sectionIds: defaultSectionIds,
      };
    }
  } else if (defaultSectionIds?.length) {
    initial = { sectionIds: defaultSectionIds };
  }

  return (
    <AppShell
      role="professor"
      active="assignments"
      topbarTitle="New discussion"
      maxWidth="narrow"
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: withBasePath('/dashboard/professor') },
          {
            label: backLabel,
            href: backHref,
          },
          { label: 'New discussion' },
        ]}
        eyebrow="Discussion"
        title="Create a discussion."
        description="Author the Socratic flow, optionally link a quiz in learning mode, and assign sections. Discussions track completion in Assignments."
      />
      <div className="mt-10">
        <ChatbotCreationForm
          sections={enrolledSections}
          quizzes={quizOptions}
          initial={initial}
        />
      </div>
    </AppShell>
  );
}
