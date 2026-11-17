import { AlertTriangle, CheckCircle, Clock, Eye, ServerCrash } from "@/components/icons";
import { requireTeachingAccess } from '@/lib/authz/gates';

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { EmptyState } from "@/components/patterns/EmptyState";
import { StatCard } from "@/components/patterns/StatCard";
import { ResolveRegradeRequestButton } from "@/components/professor/ResolveRegradeRequestButton";
import { QuickRegradeButton } from "@/components/quiz/QuickRegradeButton";
import { RegradeAllButton } from "@/components/quiz/RegradeAllButton";
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
import { withBasePath } from "@/lib/basePath";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { getAttentionItemsForProfessor } from "@/lib/professor/attention";
import { listTutorEscalationsForProfessor } from "@/lib/professor/tutorEscalations";
import { listOpenRegradeRequestsForProfessor } from "@/lib/quiz/regradeRequests";
import { LocalDateTime } from "@/components/timezone/LocalDateTime";

export const dynamic = "force-dynamic";

export default async function AttentionPage() {
  const user = await requireTeachingAccess();

  const [items, regradeRequests, tutorEscalations] = await Promise.all([
    getAttentionItemsForProfessor(user.id, { limit: 200 }),
    listOpenRegradeRequestsForProfessor(user.id),
    listTutorEscalationsForProfessor(user.id, { limit: 100 }),
  ]);

  const totalAttempts = items.length;
  const totalPending = items.reduce((s, i) => s + i.pendingCount, 0);
  const totalManualReview = items.reduce(
    (s, i) => s + i.manualReviewCount,
    0,
  );
  const totalLegacy = items.reduce((s, i) => s + i.legacyFallbackCount, 0);
  const failedAttempts = items.filter((i) => i.gradingStatus === "failed");
  const partialAttempts = items.filter((i) => i.gradingStatus === "partial");
  const showOutageBanner =
    totalManualReview > 0 || failedAttempts.length > 0 || totalPending > 0;

  return (
    <AppShell
      role="professor"
      active="attention"
      topbarTitle="Attention queue"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/professor") },
          { label: "Attention" },
        ]}
        eyebrow="Grading"
        title="Responses that need your attention"
        description="Submissions where at least one short-answer question is still pending, awaiting manual review, or used the legacy fallback grader. Re-grade in place, or open the attempt to review and override scores."
        actions={<RegradeAllButton count={totalAttempts} />}
      />

      {showOutageBanner ? (
        <div
          className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <div className="flex items-start gap-2">
            <ServerCrash className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Grading backlog</p>
              <p className="mt-1 text-amber-900/90">
                {totalPending > 0
                  ? `${totalPending} short-answer question${totalPending === 1 ? "" : "s"} still waiting on auto-grade`
                  : null}
                {totalPending > 0 && totalManualReview > 0 ? " · " : null}
                {totalManualReview > 0
                  ? `${totalManualReview} need manual review`
                  : null}
                {failedAttempts.length > 0
                  ? `${totalPending > 0 || totalManualReview > 0 ? " · " : ""}${failedAttempts.length} attempt${failedAttempts.length === 1 ? "" : "s"} marked failed`
                  : null}
                {partialAttempts.length > 0 && totalPending === 0
                  ? `${failedAttempts.length > 0 || totalManualReview > 0 ? " · " : ""}${partialAttempts.length} partial submission${partialAttempts.length === 1 ? "" : "s"}`
                  : null}
                . Re-grade from this queue or open an attempt to override scores.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {tutorEscalations.length > 0 ? (
        <section className="mt-10">
          <SectionHeading
            eyebrow="Tutor"
            title="Escalation inbox"
            description="Students who asked to flag their instructor on a discussion thread."
          />
          <div className="mt-4 overflow-x-auto rounded-lg border border-rule/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Discussion</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Preview</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tutorEscalations.map((e) => (
                  <TableRow key={e.sessionId}>
                    <TableCell>
                      {e.escalatedAt ? (
                        <LocalDateTime value={e.escalatedAt} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {[e.student.firstName, e.student.lastName]
                        .filter(Boolean)
                        .join(" ") || e.student.email}
                    </TableCell>
                    <TableCell>{e.chatbotTitle}</TableCell>
                    <TableCell>
                      {e.courseTitle ? `${e.courseTitle} · ` : ""}
                      {e.sectionName}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {e.preview ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      {regradeRequests.length > 0 ? (
        <section className="mt-10">
          <SectionHeading
            eyebrow="Students"
            title="Regrade requests"
            description="Open requests from students who asked for a human review."
          />
          <div className="mt-4 overflow-x-auto rounded-lg border border-rule/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regradeRequests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <LocalDateTime value={r.createdAt} />
                    </TableCell>
                    <TableCell>
                      {[r.studentFirstName, r.studentLastName]
                        .filter(Boolean)
                        .join(" ") || r.studentEmail}
                    </TableCell>
                    <TableCell className="max-w-md truncate">{r.note}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={withBasePath(
                              `/dashboard/professor/attempt/${r.attemptId}`,
                            )}
                          >
                            Open attempt
                          </a>
                        </Button>
                        <ResolveRegradeRequestButton requestId={r.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <section className="mt-12 flex flex-col gap-6">
        <SectionHeading
          eyebrow="At a glance"
          title="What's waiting"
          description="Counts across all the sections you teach."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Attempts"
            value={totalAttempts}
            icon={<Eye className="h-4 w-4" />}
            hint="Need your review"
          />
          <StatCard
            label="Pending questions"
            value={totalPending}
            icon={<Clock className="h-4 w-4" />}
            hint="Auto-retry in progress"
          />
          <StatCard
            label="Manual review"
            value={totalManualReview}
            icon={<AlertTriangle className="h-4 w-4" />}
            hint="Auto-grader gave up"
            accent={totalManualReview > 0}
          />
          <StatCard
            label="Legacy fallback"
            value={totalLegacy}
            icon={<CheckCircle className="h-4 w-4" />}
            hint="Older fallback grade"
          />
        </div>
      </section>

      <section className="mt-16">
        <SectionHeading
          eyebrow="Queue"
          title="By most recent submission"
          description="One row per attempt. The badge shows why it needs attention."
          actions={
            totalAttempts > 0 ? (
              <RegradeAllButton count={totalAttempts} />
            ) : null
          }
        />

        {items.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<CheckCircle className="h-5 w-5" />}
              eyebrow="All clear"
              title="Nothing in the queue."
              description="Every short-answer response in your sections has been graded. The auto-grader will surface anything here automatically when it needs your attention."
            />
          </div>
        ) : (
          <div className="mt-6 paper paper-shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Quiz</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="tnum">Needs</TableHead>
                  <TableHead className="tnum">Score so far</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const fullName = `${item.student.firstName ?? ""} ${
                    item.student.lastName ?? ""
                  }`.trim() || item.student.email || "Unknown";
                  const courseTitle = item.section.course?.title ?? "";

                  const badges: React.ReactNode[] = [];
                  if (item.manualReviewCount > 0) {
                    badges.push(
                      <Badge key="manual" variant="destructive">
                        Manual review · {item.manualReviewCount}
                      </Badge>,
                    );
                  }
                  if (item.pendingCount > 0) {
                    badges.push(
                      <Badge key="pending" variant="warning">
                        Pending · {item.pendingCount}
                      </Badge>,
                    );
                  }
                  if (item.legacyFallbackCount > 0) {
                    badges.push(
                      <Badge key="legacy" variant="secondary">
                        Legacy · {item.legacyFallbackCount}
                      </Badge>,
                    );
                  }
                  if (badges.length === 0) {
                    badges.push(
                      <Badge key="unknown" variant="outline">
                        Needs review
                      </Badge>,
                    );
                  }

                  return (
                    <TableRow key={item.attemptId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-ink truncate max-w-[18ch]">
                            {fullName}
                          </span>
                          <span className="text-xs text-ink-faint truncate max-w-[22ch]">
                            {item.student.email ?? ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-ink truncate block max-w-[22ch]">
                          {item.quiz.title}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm text-ink truncate max-w-[18ch]">
                            {item.section.name}
                          </span>
                          {courseTitle ? (
                            <span className="text-xs text-ink-faint truncate max-w-[22ch]">
                              {courseTitle}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-ink-muted tnum">
                        <LocalDateTime value={item.submittedAt} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">{badges}</div>
                      </TableCell>
                      <TableCell className="tnum">
                        <span className="font-medium text-ink">
                          {item.needsAttentionCount}
                        </span>
                        <span className="text-xs text-ink-faint">
                          {" "}
                          / {item.totalShortAnswer}
                        </span>
                      </TableCell>
                      <TableCell className="tnum">
                        <span className="text-sm text-ink">
                          {item.percentage != null ? `${item.percentage}%` : "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild variant="ghost" size="sm">
                            <a
                              href={withBasePath(
                                `/dashboard/professor/attempt/${item.attemptId}`,
                              )}
                              aria-label="Open attempt"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                          </Button>
                          <QuickRegradeButton attemptId={item.attemptId} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
