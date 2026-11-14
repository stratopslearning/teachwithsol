import { eq, inArray } from 'drizzle-orm';
import { requireTeachingAccess } from '@/lib/authz/gates';

import { db } from '@/app/db';
import { professorSections, quizSections, quizzes } from '@/app/db/schema';
import { ChatbotCreationForm } from '@/components/chatbot/ChatbotCreationForm';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { withBasePath } from '@/lib/basePath';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { partitionEnrollmentsByConclusion } from '@/lib/sectionAvailability';
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

  const ownedQuizzes = await db.query.quizzes.findMany({
    where: eq(quizzes.professorId, user.id),
  });

  const sectionQuizLinks =
    enrolledSectionIds.length > 0
      ? await db.query.quizSections.findMany({
          where: inArray(quizSections.sectionId, enrolledSectionIds),
          with: { quiz: true },
        })
      : [];

  const quizMap = new Map<string, { id: string; title: string }>();
  for (const q of ownedQuizzes) {
    if (!q.deletedAt) quizMap.set(q.id, { id: q.id, title: q.title });
  }
  for (const link of sectionQuizLinks) {
    if (link.quiz && !link.quiz.deletedAt) {
      quizMap.set(link.quiz.id, {
        id: link.quiz.id,
        title: link.quiz.title,
      });
    }
  }
  const quizOptions = Array.from(quizMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title),
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
      const full = await db.query.quizzes.findFirst({
        where: eq(quizzes.id, quizId),
      });
      initial = {
        title: `${quiz.title} Discussion`,
        description: full?.description ?? undefined,
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
