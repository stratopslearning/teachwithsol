import Link from "next/link";

import { fetchAdminSectionsAll } from "@/lib/admin/platformReads";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuizCreationForm } from "@/components/quiz/QuizCreationForm";
import { withBasePath } from "@/lib/basePath";
import { requireAdmin } from "@/lib/auth";
import { partitionBySectionConclusion } from "@/lib/sectionAvailability";

export default async function AdminQuizNewPage() {
  await requireAdmin();
  // FORCE RLS: a plain db read returns no sections; use the admin definer.
  const allSectionsRaw = (await fetchAdminSectionsAll()).filter(
    (s) => s.deletedAt == null,
  );
  const { active: ongoingSections } =
    partitionBySectionConclusion(allSectionsRaw);
  const courseOptions = ongoingSections.map((section) => ({
    id: section.id,
    title: `${section.name} (${section.course?.title || "Unknown"})`,
  }));

  return (
    <AppShell role="admin" active="workspaces" maxWidth="wide">
      <PageHeader
        eyebrow="Quiz"
        title="Create a quiz"
        description="Author questions, set timing rules, and publish to a section. Quizzes are one assignment type."
        breadcrumbs={[
          {
            label: "Assignments",
            href: withBasePath("/dashboard/admin/assignments"),
          },
          { label: "New quiz" },
        ]}
      />
      <div className="mt-8">
        <QuizCreationForm
          courses={courseOptions}
          apiEndpoint="/api/admin/quiz/create"
        />
      </div>
      <div className="mt-10">
        <Link
          href="/dashboard/admin/assignments"
          className="text-sm text-ink-muted hover:text-brand transition-colors"
        >
          ← Back to assignments
        </Link>
      </div>
    </AppShell>
  );
}
