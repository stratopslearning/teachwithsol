import Link from "next/link";

import StudentEnrollFormWrapper from "@/components/StudentEnrollFormWrapper";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { appPath, withBasePath } from "@/lib/basePath";
import { requireStudent } from "@/lib/auth";
import { fetchUserEnrollmentsDetail } from "@/lib/db/facultyStudentReads";
import { partitionEnrollmentsByConclusion } from "@/lib/sections/availability";

import StudentSectionsPageContentClient from "./StudentSectionsPageContentClient";

export default async function StudentSectionsPage() {
  const user = await requireStudent();

  const enrollmentRows = await fetchUserEnrollmentsDetail(user.id);
  const enrollments = enrollmentRows.map((e) => ({
    id: e.id,
    sectionId: e.sectionId,
    section: {
      id: e.section.id,
      name: e.section.name,
      endsAt: e.section.endsAt,
      courseId: e.section.course.id,
      course: e.section.course,
    },
  }));

  const { active: activeEnrollments, archived: archivedEnrollments } =
    partitionEnrollmentsByConclusion(enrollments);
  const sectionsList = activeEnrollments.map((e) => e.section);

  return (
    <AppShell
      role="student"
      user={user}
      topbarTitle="My sections"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/student") },
          { label: "My sections" },
        ]}
        eyebrow="Enrolment"
        title="Where you're studying."
        description="Every active section you've joined this term, with the courses they belong to and the work assigned to each."
        actions={
          archivedEnrollments.length > 0 ? (
            <Button asChild variant="outline">
              <Link href={appPath("/dashboard/student/sections/archived")}>
                View past sections ({archivedEnrollments.length})
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mt-8">
        <StudentEnrollFormWrapper />
      </div>

      <div className="mt-10">
        <StudentSectionsPageContentClient sectionsList={sectionsList} />
      </div>
    </AppShell>
  );
}
