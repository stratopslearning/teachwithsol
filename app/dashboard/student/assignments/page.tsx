import Link from "next/link";
import { BookOpen } from "@/components/icons";

import { AssignmentsTableClient } from "@/components/assignments/AssignmentsTableClient";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { listStudentActivities } from "@/lib/assignments";
import { requireStudent } from "@/lib/auth";
import { withBasePath } from "@/lib/basePath";
import { listStudentBooks } from "@/lib/books";
import { fetchUserEnrollmentsDetail } from "@/lib/db/facultyStudentReads";
import { partitionEnrollmentsByConclusion } from "@/lib/sectionAvailability";

export default async function StudentAssignmentsPage() {
  const user = await requireStudent();

  const enrollments = await fetchUserEnrollmentsDetail(user.id);
  const { active } = partitionEnrollmentsByConclusion(enrollments);
  const sectionIds = active.map((e) => e.sectionId);

  const [items, books] = await Promise.all([
    listStudentActivities({
      studentId: user.id,
      sectionIds,
    }),
    listStudentBooks(user.id),
  ]);

  return (
    <AppShell
      role="student"
      active="assignments"
      user={user}
      topbarTitle="Assignments"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/student") },
          { label: "Assignments" },
        ]}
        eyebrow="Your work"
        title="Assignments."
        description="Quizzes, lessons, books, discussions, and interactives assigned across your sections. Prefer your section hub for course-scoped work."
      />

      {books.length > 0 ? (
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">Books</h2>
            {books.some((b) => b.sectionIds[0]) ? (
              <Link
                href={withBasePath(
                  books.length === 1 && books[0]!.sectionIds[0]
                    ? `/dashboard/student/sections/${books[0]!.sectionIds[0]}/books`
                    : `/dashboard/student/sections/${books[0]!.sectionIds[0]}`,
                )}
                className="text-xs text-brand hover:underline"
              >
                Open in section
              </Link>
            ) : null}
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card/40">
            {books.map((b) => (
              <li key={b.id}>
                <Link
                  href={b.href}
                  className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                    <BookOpen className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{b.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {b.courseTitle}
                      {b.sectionNames.length
                        ? ` · ${b.sectionNames.join(", ")}`
                        : ""}
                      {` · ${b.chapterCount} chapter${b.chapterCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10">
        <AssignmentsTableClient items={items} role="student" />
      </div>
    </AppShell>
  );
}
