import Link from "next/link";
import { Archive } from "@/components/icons";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { EmptyState } from "@/components/patterns/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { appPath, withBasePath } from "@/lib/basePath";
import { requireStudent } from "@/lib/auth";
import { fetchUserEnrollmentsDetail } from "@/lib/db/facultyStudentReads";
import { partitionEnrollmentsByConclusion } from "@/lib/sectionAvailability";
import {
  LocalDateTime,
  TIMESTAMP_CELL_CLASS,
} from "@/components/timezone/LocalDateTime";

export default async function StudentArchivedSectionsPage() {
  const user = await requireStudent();

  const enrollments = await fetchUserEnrollmentsDetail(user.id);

  const { archived } = partitionEnrollmentsByConclusion(enrollments);
  const rows = archived
    .map((e) => ({
      id: e.section.id,
      name: e.section.name,
      endsAt: e.section.endsAt,
      course: e.section.course,
    }))
    .sort((a, b) => {
      const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : 0;
      const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : 0;
      return bEnd - aEnd;
    });

  return (
    <AppShell
      role="student"
      user={user}
      topbarTitle="Past sections"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/student") },
          {
            label: "My sections",
            href: withBasePath("/dashboard/student/sections"),
          },
          { label: "Past sections" },
        ]}
        eyebrow="Archive"
        title="Past sections."
        description="Sections that have ended. You can still review grades and prior attempts. New quizzes and discussions are closed."
        actions={
          <Button asChild variant="outline">
            <Link href={appPath("/dashboard/student/sections")}>
              Back to active sections
            </Link>
          </Button>
        }
      />

      <section className="mt-10">
        <SectionHeading
          eyebrow="Concluded"
          title="Archived enrollments"
          description="Canvas-style past course list. Read-only for new work."
        />

        <div className="mt-6">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Archive className="h-5 w-5" />}
              eyebrow="Nothing here"
              title="No past sections yet."
              description="When a section end date passes, it moves here from My sections."
            />
          ) : (
            <div className="paper paper-shadow overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead className="min-w-[13rem]">Ended</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Grades</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((section) => (
                    <TableRow key={section.id}>
                      <TableCell className="font-medium">
                        {section.name}
                      </TableCell>
                      <TableCell className="text-ink-muted">
                        {section.course?.title ?? "-"}
                      </TableCell>
                      <TableCell className={`text-ink-muted ${TIMESTAMP_CELL_CLASS}`}>
                        {section.endsAt
                          ? <LocalDateTime stacked value={section.endsAt} />
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Archived</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={appPath(
                              `/dashboard/student/grades?sectionId=${section.id}`,
                            )}
                          >
                            View grades
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
