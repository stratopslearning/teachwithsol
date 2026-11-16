"use client";

import { useLocalDate } from "@/components/timezone/useLocalDate";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock } from "@/components/icons";

import type { ActivityListItem, ActivityType } from "@/lib/assignments/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FILTERS: Array<{ id: ActivityType | "ALL"; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "QUIZ", label: "Quizzes" },
  { id: "LESSON", label: "Lessons" },
  { id: "DISCUSSION", label: "Discussions" },
  { id: "INTERACTIVE", label: "Interactives" },
];

const TYPE_LABEL: Record<ActivityType, string> = {
  QUIZ: "Quiz",
  LESSON: "Lesson",
  DISCUSSION: "Discussion",
  INTERACTIVE: "Interactive",
};

function progressLabel(item: ActivityListItem) {
  switch (item.completionStatus) {
    case "COMPLETED":
      return "Completed";
    case "SCORED":
      return item.bestPercentage != null
        ? `Submitted · ${item.bestPercentage}%`
        : "Submitted";
    case "IN_PROGRESS":
      return "In progress";
    default:
      return "Not started";
  }
}

function progressTone(item: ActivityListItem): "default" | "success" | "secondary" {
  switch (item.completionStatus) {
    case "COMPLETED":
    case "SCORED":
      return "success";
    case "IN_PROGRESS":
      return "secondary";
    default:
      return "secondary";
  }
}

function scheduleMeta(
  item: ActivityListItem,
  formatDue: (iso: string) => string,
  now = new Date(),
) {
  const start = item.startDate ? new Date(item.startDate) : null;
  const end = item.endDate ? new Date(item.endDate) : null;

  if (start && now < start) {
    return { label: `Opens ${formatDue(item.startDate!)}`, tone: "muted" as const };
  }
  if (end) {
    if (now > end) {
      return { label: `Closed ${formatDue(item.endDate!)}`, tone: "danger" as const };
    }
    const hoursLeft = (end.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursLeft <= 48) {
      return { label: `Due ${formatDue(item.endDate!)}`, tone: "warn" as const };
    }
    return { label: `Due ${formatDue(item.endDate!)}`, tone: "muted" as const };
  }
  return null;
}

function ctaLabel(item: ActivityListItem, role: "professor" | "student" | "admin") {
  if (role !== "student") return "Manage";
  switch (item.completionStatus) {
    case "SCORED":
    case "COMPLETED":
      return item.type === "QUIZ" ? "Review" : "Open";
    case "IN_PROGRESS":
      return "Continue";
    default:
      return item.type === "QUIZ" ? "Start" : "Open";
  }
}

export function AssignmentsTableClient({
  items,
  role,
}: {
  items: ActivityListItem[];
  role: "professor" | "student" | "admin";
}) {
  const localDate = useLocalDate();
  const [filter, setFilter] = useState<ActivityType | "ALL">("ALL");
  const filtered = useMemo(
    () =>
      filter === "ALL" ? items : items.filter((i) => i.type === filter),
    [items, filter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            type="button"
            size="sm"
            variant={filter === f.id ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted py-10 text-center">
          No assignments in this view yet.
        </p>
      ) : (
        <ul className="divide-y divide-rule rounded-xl border border-rule bg-surface">
          {filtered.map((item) => {
            const schedule = scheduleMeta(item, localDate.shortDateTime);
            const attempts =
              item.type === "QUIZ" && item.attemptCount != null
                ? item.maxAttempts != null && item.maxAttempts > 0
                  ? `${item.attemptCount}/${item.maxAttempts} attempts`
                  : `${item.attemptCount} attempt${item.attemptCount === 1 ? "" : "s"}`
                : null;

            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="font-mono text-[0.65rem]"
                    >
                      {TYPE_LABEL[item.type]}
                    </Badge>
                    {role === "student" ? (
                      <Badge variant={progressTone(item)} className="text-[0.65rem]">
                        {progressLabel(item)}
                      </Badge>
                    ) : null}
                    <Link
                      href={item.href}
                      className="truncate font-medium text-ink hover:underline"
                    >
                      {item.title}
                    </Link>
                  </div>

                  {item.description?.trim() ? (
                    <p className="line-clamp-1 text-sm text-ink-muted">
                      {item.description.trim()}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
                    <span>
                      {item.courseTitle ?? "Course"}
                      {item.sectionNames.length
                        ? ` · ${item.sectionNames.join(", ")}`
                        : ""}
                    </span>
                    {schedule ? (
                      <>
                        <span aria-hidden>·</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            schedule.tone === "danger" && "text-destructive",
                            schedule.tone === "warn" && "text-brand",
                          )}
                        >
                          <Clock className="h-3 w-3" aria-hidden />
                          {schedule.label}
                        </span>
                      </>
                    ) : null}
                    {attempts ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{attempts}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {role !== "student" ? (
                    <span className="text-sm text-ink-muted">
                      {item.isActive ? "Released" : "Draft"}
                    </span>
                  ) : item.bestPercentage != null &&
                    item.completionStatus === "SCORED" ? (
                    <span className="tabular-nums text-sm font-medium text-ink">
                      {item.bestPercentage}%
                    </span>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link href={item.href}>{ctaLabel(item, role)}</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
