import { eq, inArray } from "drizzle-orm";
import { requireTeachingAccess } from '@/lib/authz/gates';
import { Eye, FileText, TrendingUp, Users } from "@/components/icons";

import { readBySectionTenants } from "@/lib/db/sectionTenants";
import { professorSections, quizSections } from "@/app/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { EmptyState } from "@/components/patterns/EmptyState";
import { StatCard } from "@/components/patterns/StatCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { fetchSubmittedAttemptsForProfessorSections } from "@/lib/professorVisibleAttempts";
import { partitionEnrollmentsByConclusion } from "@/lib/sectionAvailability";
import { listTeachingSectionIds } from '@/lib/professor/graderSections';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import { cleanQuizDescription } from "@/lib/utils";

export default async function QuizResultsPage() {
  const user = await requireTeachingAccess();

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

  const enrolledSectionIds = ongoingEnrollments.map((ps) => ps.section.id);

  if (enrolledSectionIds.length === 0) {
    return (
      <AppShell
        role="professor"
        active="quiz-results"
        topbarTitle="All results"
      >
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: withBasePath("/dashboard/professor") },
            { label: "All results" },
          ]}
          eyebrow="Results"
          title="No sections to report on."
          description="You need to be enrolled in at least one section before student results appear here."
        />
        <div className="mt-12">
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            eyebrow="Empty"
            title="No quiz results yet."
            description="Once you're enrolled in a section, all assigned quiz results will be summarised on this page."
            actions={
              <Button asChild>
                <a href={withBasePath("/dashboard/professor/sections")}>
                  Join a section
                </a>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  // FORCE RLS: a plain db read returns no assignments (this page was always
  // empty). Read each tenant's sections under that tenant, newest first.
  const quizAssignmentRows = await readBySectionTenants(
    enrolledSectionIds,
    user.id,
    (tx, ids) =>
      tx.query.quizSections.findMany({
        where: inArray(quizSections.sectionId, ids),
        with: {
          quiz: {
            columns: {
              id: true,
              title: true,
              description: true,
              isActive: true,
              professorId: true,
              deletedAt: true,
            },
            with: {
              professor: {
                columns: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          section: { with: { course: { columns: { id: true, title: true } } } },
        },
        orderBy: (quizSections, { desc }) => desc(quizSections.assignedAt),
      }),
  );
  const quizAssignments = quizAssignmentRows.sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
  );

  const quizStats = await Promise.all(
    quizAssignments.map(async (qa) => {
    const quiz = qa.quiz;
    const attempts = await fetchSubmittedAttemptsForProfessorSections({
      quizId: quiz.id,
      professorSectionIds: enrolledSectionIds,
      restrictToSectionId: qa.section.id,
    });

    const totalAttempts = attempts.length;
    const uniqueStudents = new Set(attempts.map((a) => a.studentId)).size;
    const bestPerStudent: Record<string, number> = {};
    attempts.forEach((a) => {
      const pct =
        a.percentage ??
        (a.maxScore ? Math.round(((a.score ?? 0) / a.maxScore) * 100) : 0);
      if (
        bestPerStudent[a.studentId] == null ||
        pct > bestPerStudent[a.studentId]
      ) {
        bestPerStudent[a.studentId] = pct;
      }
    });
    const bestPercentages = Object.values(bestPerStudent);
    const averageScore =
      bestPercentages.length > 0
        ? Math.round(
            bestPercentages.reduce((sum, p) => sum + p, 0) /
              bestPercentages.length,
          )
        : 0;

    return {
      quiz,
      section: qa.section,
      totalAttempts,
      uniqueStudents,
      averageScore,
      lastAttempt:
        attempts.length > 0
          ? new Date(
              Math.max(
                ...attempts.map((a) =>
                  new Date(a.submittedAt || 0).getTime(),
                ),
              ),
            )
          : null,
    };
  }),
  );

  const totalAttempts = quizStats.reduce((s, q) => s + q.totalAttempts, 0);
  const totalLearners = new Set(
    quizStats.flatMap((q) => Array(q.uniqueStudents).fill(q.section.id + "-")),
  ).size;
  const overallAvg =
    quizStats.length > 0
      ? Math.round(
          quizStats.reduce((s, q) => s + q.averageScore, 0) / quizStats.length,
        )
      : 0;

  return (
    <AppShell
      role="professor"
      active="quiz-results"
      topbarTitle="All results"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/professor") },
          { label: "All results" },
        ]}
        eyebrow="Results"
        title="A bird's-eye view of every quiz."
        description="Aggregated performance across every quiz assigned to a section you teach."
      />

      <section className="mt-12 flex flex-col gap-6">
        <SectionHeading eyebrow="Summary" title="Across your sections" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Quizzes"
            value={quizStats.length}
            icon={<FileText className="h-4 w-4" />}
            hint="Tracked"
          />
          <StatCard
            label="Submissions"
            value={totalAttempts}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Total attempts"
          />
          <StatCard
            label="Learners"
            value={totalLearners}
            icon={<Users className="h-4 w-4" />}
            hint="Active in sections"
          />
          <StatCard
            label="Average"
            value={`${overallAvg}%`}
            hint="Best score per learner"
            accent
          />
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading eyebrow="Detail" title="Per-section results" />
        {quizStats.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              eyebrow="Empty"
              title="No quizzes assigned yet."
              description="Once a quiz is assigned to one of your sections, results will appear here."
            />
          </div>
        ) : (
          <div className="mt-6 paper paper-shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quiz</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead className="tnum">Attempts</TableHead>
                  <TableHead className="tnum">Average</TableHead>
                  <TableHead>Last attempt</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quizStats.map((stat) => (
                  <TableRow key={`${stat.quiz.id}-${stat.section.id}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">
                          {stat.quiz.title}
                        </span>
                        {cleanQuizDescription(stat.quiz.description) ? (
                          <span className="text-xs text-ink-faint line-clamp-1">
                            {cleanQuizDescription(stat.quiz.description)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">
                          {stat.section.name}
                        </span>
                        <span className="text-xs text-ink-faint">
                          {stat.section.course.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm text-ink">
                          {stat.quiz.professor.firstName}{" "}
                          {stat.quiz.professor.lastName}
                        </span>
                        <span className="text-xs text-ink-faint">
                          {stat.quiz.professor.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tnum">
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">
                          {stat.totalAttempts}
                        </span>
                        <span className="text-xs text-ink-faint">
                          {stat.uniqueStudents} learners
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tnum">
                      <span className="font-display text-lg text-ink">
                        {stat.averageScore}%
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-ink-muted tnum">
                      {stat.lastAttempt
                        ? stat.lastAttempt.toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={withBasePath(
                            `/dashboard/professor/quiz/${stat.quiz.id}/results`,
                          )}
                          aria-label="View detail"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
