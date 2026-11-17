import { requireTeachingAccess } from '@/lib/authz/gates';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { Copy, Eye, ShieldCheck } from "@/components/icons";
import { notFound } from "next/navigation";

import { loadQuizEditPage } from "@/lib/data/pages/professorQuizzes";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { QuizEditForm } from "@/components/quiz/QuizEditForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/basePath";
import { listTeachingSectionIds } from "@/lib/professor/graderSections";
import { professorCanAccessQuiz, userCanWriteQuiz } from "@/lib/quizAccess";
import { isSectionConcluded } from "@/lib/sectionAvailability";

import { CreateEditableCopyButton } from "./CreateEditableCopyButton";
import { ReleaseBadge } from "@/components/status/badges";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const user = await requireTeachingAccess();

  if (!(await professorCanAccessQuiz(user, quizId))) notFound();
  if (!(await userCanWriteQuiz(user, quizId))) notFound();

  const teachingIds = await listTeachingSectionIds(user);
  const writableSectionIds = new Set<string>();
  for (const sectionId of teachingIds) {
    if (await authorizeOnSection(user, "content.write", sectionId)) {
      writableSectionIds.add(sectionId);
    }
  }

  const { teachingSections, quiz } = await loadQuizEditPage(quizId, teachingIds, user.id);

  if (!quiz) notFound();

  const authorId = quiz.professorId;
  const isAuthor = Boolean(authorId && authorId === user.id);
  const editableSectionAssignments = quiz.sectionAssignments.filter((sa) =>
    writableSectionIds.has(sa.section.id),
  );

  if (!isAuthor && editableSectionAssignments.length === 0) notFound();

  if (!isAuthor) {
    const editableSectionNames = editableSectionAssignments
      .map((sa) => sa.section.name)
      .join(", ");

    return (
      <AppShell
        role="professor"
        active="assignments"
        topbarTitle={quiz.title}
        maxWidth="wide"
      >
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: withBasePath("/dashboard/professor") },
            {
              label: "Assignments",
              href: withBasePath("/dashboard/professor/assignments"),
            },
            { label: "Edit quiz" },
          ]}
          eyebrow="Shared quiz"
          title={quiz.title}
          description={`This quiz was created by ${
            quiz.professor?.email ?? "another instructor"
          }. Click Edit to work on a version for your section only. Other sections keep the original.`}
          actions={
            <Button asChild variant="outline">
              <a
                href={withBasePath(
                  `/dashboard/professor/quiz/${quiz.id}/results`,
                )}
              >
                <Eye className="h-4 w-4" />
                View results
              </a>
            </Button>
          }
        />

        <section className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="paper paper-shadow p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Copy className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="eyebrow text-ink-faint">Shared quiz</span>
                <h2 className="mt-2 font-display text-2xl text-ink">
                  Edit this quiz for your section.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">
                  This quiz is shared across sections. Editing creates your own
                  version and moves only the sections you teach onto it, so
                  other classes keep the original.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {editableSectionAssignments.map((assignment) => (
                    <Badge key={assignment.section.id} variant="info">
                      {assignment.section.course.title} · {assignment.section.name}
                    </Badge>
                  ))}
                </div>
                <div className="mt-8">
                  <CreateEditableCopyButton quizId={quiz.id} />
                </div>
              </div>
            </div>
          </div>

          <aside className="paper paper-shadow p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-ink-faint" />
              <div>
                <span className="eyebrow text-ink-faint">What changes</span>
                <h3 className="font-display text-lg text-ink">
                  Only your section moves.
                </h3>
              </div>
            </div>
            <dl className="mt-6 space-y-5 text-sm">
              <div>
                <dt className="eyebrow text-ink-faint">Your sections</dt>
                <dd className="mt-1 text-ink">{editableSectionNames}</dd>
              </div>
              <div>
                <dt className="eyebrow text-ink-faint">Original quiz</dt>
                <dd className="mt-1 text-ink-muted">
                  Stays assigned to sections you do not teach.
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-ink-faint">After you edit</dt>
                <dd className="mt-1 text-ink-muted">
                  You can change title, questions, dates, attempts, and status
                  on your version.
                </dd>
              </div>
            </dl>
          </aside>
        </section>
      </AppShell>
    );
  }

  const safeQuestions = quiz.questions.map((q) => ({
    ...q,
    options: Array.isArray(q.options)
      ? q.options
      : typeof q.options === "string"
        ? (() => {
            try {
              const arr = JSON.parse(q.options);
              return Array.isArray(arr) ? arr : null;
            } catch {
              return null;
            }
          })()
        : null,
  }));

  const assignedSectionIds = quiz.sectionAssignments.map(
    (sa) => sa.section.id,
  );
  const assignedIdSet = new Set(assignedSectionIds);

  // Prefer ongoing sections for assignment; keep currently assigned concluded
  // sections visible so edit doesn't silently drop them.
  const sectionOptionsSource = teachingSections.filter(
    (section) =>
      !isSectionConcluded(section) || assignedIdSet.has(section.id),
  );
  const enrolledSections = sectionOptionsSource.map((section) => ({
    id: section.id,
    title: `${section.course.title} - ${section.name}`,
    description: section.course.description,
  }));

  return (
    <AppShell
      role="professor"
      active="assignments"
      topbarTitle={quiz.title}
      maxWidth="wide"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/professor") },
          {
            label: "Assignments",
            href: withBasePath("/dashboard/professor/assignments"),
          },
          { label: "Edit quiz" },
        ]}
        eyebrow="Revise"
        title={quiz.title}
        description={
          quiz.sectionAssignments.length > 0
            ? `Assigned to ${quiz.sectionAssignments
                .map((sa) => sa.section.name)
                .join(", ")}`
            : "Not yet assigned to a section."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a
                href={withBasePath(
                  `/dashboard/professor/quiz/${quiz.id}/calibration`,
                )}
              >
                Calibration
              </a>
            </Button>
            <Button asChild variant="outline">
              <a
                href={withBasePath(
                  `/dashboard/professor/quiz/${quiz.id}/results`,
                )}
              >
                <Eye className="h-4 w-4" />
                View results
              </a>
            </Button>
          </div>
        }
      />

      <section className="mt-12">
        <SectionHeading eyebrow="Specification" title="Quiz at a glance" />
        <dl className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-6 paper paper-shadow p-6">
          <div>
            <dt className="eyebrow text-ink-faint">Status</dt>
            <dd className="mt-2">
              <ReleaseBadge isActive={quiz.isActive} />
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-ink-faint">Questions</dt>
            <dd className="mt-2 stat-numeral text-2xl text-ink">
              {quiz.questions.length}
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-ink-faint">Max attempts</dt>
            <dd className="mt-2 stat-numeral text-2xl text-ink">
              {quiz.maxAttempts}
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-ink-faint">Time limit</dt>
            <dd className="mt-2 stat-numeral text-2xl text-ink">
              {quiz.timeLimit ? `${quiz.timeLimit}m` : "-"}
            </dd>
          </div>
        </dl>
        {quiz.description ? (
          <p className="mt-6 max-w-prose text-ink-muted">
            {quiz.description}
          </p>
        ) : null}
      </section>

      <section className="mt-16">
        <SectionHeading eyebrow="Edit" title="Questions & assignments" />
        <div className="mt-6">
          <QuizEditForm
            quiz={{ ...quiz, questions: safeQuestions }}
            courses={enrolledSections}
            assignedSectionIds={assignedSectionIds}
          />
        </div>
      </section>
    </AppShell>
  );
}
