import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { listStudentActivities } from "@/lib/assignments";
import { withBasePath } from "@/lib/basePath";
import { requireStudent } from "@/lib/auth";
import { fetchUserEnrollmentsDetail } from "@/lib/db/facultyStudentReads";
import { fetchStudentGradebookAttemptsDefiner } from "@/lib/db/studentWriteDefiners";
import { isSectionConcluded, partitionEnrollmentsByConclusion } from "@/lib/sectionAvailability";

import StudentGradesTableClient from "./StudentGradesTableClient";
import StudentCompletionsClient from "./StudentCompletionsClient";

export default async function StudentGradesPage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string }>;
}) {
  const user = await requireStudent();
  const { sectionId: focusSectionId } = await searchParams;

  const [allAttempts, enrollments] = await Promise.all([
    fetchStudentGradebookAttemptsDefiner(user.id),
    fetchUserEnrollmentsDetail(user.id),
  ]);

  const attemptRows = allAttempts.map((a) => ({
    id: a.id,
    quizId: a.quizId,
    sectionId: a.sectionId,
    sectionName: a.sectionName,
    quizTitle: a.quizTitle,
    courseTitle: a.courseTitle,
    submittedAt: a.submittedAt
      ? a.submittedAt.toISOString()
      : null,
    score: a.score,
    maxScore: a.maxScore,
    percentage: a.percentage,
    passed: a.passed,
    sectionArchived: isSectionConcluded({ endsAt: a.sectionEndsAt }),
  }));

  const { active } = partitionEnrollmentsByConclusion(enrollments);
  const sectionIds = active.map((e) => e.sectionId);
  const activities = await listStudentActivities({
    studentId: user.id,
    sectionIds,
  });
  const completionRows = activities
    .filter((a) => a.type !== "QUIZ")
    .map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      courseTitle: a.courseTitle,
      status: a.completionStatus ?? "NOT_STARTED",
      href: a.href,
    }));

  return (
    <AppShell role="student" user={user} topbarTitle="My grades">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/student") },
          { label: "My grades" },
        ]}
        eyebrow="Record"
        title="Your gradebook."
        description="Quiz scores are numeric. Lessons, discussions, and interactives show completion status."
      />
      <div className="mt-10 space-y-12">
        <StudentGradesTableClient
          attempts={attemptRows}
          initialSectionId={focusSectionId}
        />
        <StudentCompletionsClient rows={completionRows} />
      </div>
    </AppShell>
  );
}
