"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Layers,
  MoreHorizontal,
  MessageSquare,
  Pencil,
  Plus,
  Puzzle,
  Sparkles,
  SquareArrowOutUpRight,
} from "@/components/icons";
import { toast } from "sonner";

import {
  AssignSectionsDialog,
  type SectionOption,
} from "@/components/assignments/AssignSectionsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivityListItem, ActivityType } from "@/lib/assignments";
import { apiUrl, appPath } from "@/lib/basePath";
import { entityIdForActivity } from "@/lib/professor/activityEntity";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ id: "ALL" | ActivityType; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "QUIZ", label: "Quizzes" },
  { id: "DISCUSSION", label: "Discussions" },
  { id: "INTERACTIVE", label: "Interactives" },
  { id: "LESSON", label: "Lessons" },
];

function typeLabel(type: ActivityType) {
  switch (type) {
    case "QUIZ":
      return "Quiz";
    case "DISCUSSION":
      return "Discussion";
    case "INTERACTIVE":
      return "Interactive";
    case "LESSON":
      return "Lesson";
    default:
      return type;
  }
}

function TypeIcon({ type }: { type: ActivityType }) {
  const Icon =
    type === "QUIZ"
      ? ClipboardList
      : type === "DISCUSSION"
        ? MessageSquare
        : type === "INTERACTIVE"
          ? Puzzle
          : BookOpen;
  return <Icon className="h-4 w-4" aria-hidden />;
}

function formatWindow(start: string | null, end: string | null) {
  if (!start && !end) return null;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return `Until ${fmt(end!)}`;
}

/** Secondary deep-link: quiz results only when released; discussions always openable. */
function secondaryHref(item: ActivityListItem): string | null {
  if (item.type === "QUIZ" && item.quizId && item.isActive) {
    return appPath(`/dashboard/professor/quiz/${item.quizId}/results`);
  }
  if (item.type === "DISCUSSION" && item.chatbotId) {
    return appPath(`/dashboard/professor/discussions/${item.chatbotId}`);
  }
  return null;
}

export function CourseAssignmentsClient({
  activities: initialActivities,
  sectionOptions,
  createQuizHref,
  importQuizHref,
  createDiscussionHref,
  createInteractiveHref,
  authoringHref,
}: {
  activities: ActivityListItem[];
  sectionOptions: SectionOption[];
  createQuizHref?: string;
  importQuizHref?: string;
  createDiscussionHref?: string;
  createInteractiveHref?: string;
  authoringHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"ALL" | ActivityType>("ALL");
  const [activities, setActivities] = useState(initialActivities);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<ActivityListItem | null>(
    null,
  );

  useEffect(() => {
    setActivities(initialActivities);
  }, [initialActivities]);

  const visible = useMemo(() => {
    if (filter === "ALL") return activities;
    return activities.filter((a) => a.type === filter);
  }, [activities, filter]);

  const isEmpty = activities.length === 0;

  async function toggleRelease(item: ActivityListItem) {
    const next = !item.isActive;
    setTogglingId(item.id);
    try {
      let res: Response;
      if (item.type === "QUIZ" && item.quizId) {
        res = await fetch(
          apiUrl(`/api/professor/quiz/${item.quizId}/visibility`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: next }),
          },
        );
      } else if (item.type === "DISCUSSION" && item.chatbotId) {
        res = await fetch(
          apiUrl(`/api/professor/chatbot/${item.chatbotId}/update`),
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: next }),
          },
        );
      } else if (item.type === "INTERACTIVE" && item.interactiveId) {
        res = await fetch(
          apiUrl(`/api/professor/interactive/${item.interactiveId}`),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: next }),
          },
        );
      } else if (item.type === "LESSON" && item.lessonId) {
        res = await fetch(
          apiUrl(`/api/professor/lesson/${item.lessonId}/visibility`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: next }),
          },
        );
      } else {
        toast.error("Release isn’t available for this type yet");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not update release");
        return;
      }

      setActivities((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, isActive: next } : a)),
      );
      toast.success(next ? "Released to students" : "Hidden from students");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not update release");
    } finally {
      setTogglingId(null);
    }
  }

  const canCreate = Boolean(
    createQuizHref &&
      importQuizHref &&
      createDiscussionHref &&
      createInteractiveHref,
  );

  const newMenu = canCreate ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={createQuizHref!}>
            <ClipboardList className="h-4 w-4" />
            Create quiz
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={importQuizHref!}>
            <FileSpreadsheet className="h-4 w-4" />
            Import quiz CSV
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={createDiscussionHref!}>
            <MessageSquare className="h-4 w-4" />
            Discussion
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={createInteractiveHref!}>
            <Puzzle className="h-4 w-4" />
            Interactive
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={authoringHref}>
            <Sparkles className="h-4 w-4" />
            From materials
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const count =
              f.id === "ALL"
                ? activities.length
                : activities.filter((a) => a.type === f.id).length;
            if (f.id !== "ALL" && count === 0 && !isEmpty) return null;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  filter === f.id
                    ? "border-foreground/30 bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {f.label} · {count}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">{newMenu}</div>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-border bg-card/30 px-5 py-10 sm:px-8">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
              <ClipboardList className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-base font-medium text-foreground">
              No assignments for this course yet
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Create a quiz by hand, import a CSV, or draft from course
              materials — then edit and release from this list.
            </p>
          </div>

          {canCreate ? (
            <>
              <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
                <Link
                  href={createQuizHref!}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-background/70 p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors group-hover:text-foreground">
                    <Plus className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Create quiz
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      Questions, schedule, and points — ready to release.
                    </p>
                  </div>
                </Link>

                <Link
                  href={importQuizHref!}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-background/70 p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors group-hover:text-foreground">
                    <FileSpreadsheet className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Import CSV
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      Upload a spreadsheet of questions, then set schedule.
                    </p>
                  </div>
                </Link>

                <Link
                  href={authoringHref}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-background/70 p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors group-hover:text-foreground">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Author from materials
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      Propose an outline from Knowledge, then publish what you
                      approve.
                    </p>
                  </div>
                </Link>
              </div>

              <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <Link
                  href={createDiscussionHref!}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  Discussion
                </Link>
                <span aria-hidden className="text-border">
                  ·
                </span>
                <Link
                  href={createInteractiveHref!}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                >
                  <Puzzle className="h-3.5 w-3.5" aria-hidden />
                  Interactive
                </Link>
              </div>
            </>
          ) : (
            <p className="mx-auto mt-6 max-w-lg text-center text-sm text-muted-foreground">
              Creating assignments is paused until billing is restored.
            </p>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No {filter === "ALL" ? "assignments" : typeLabel(filter).toLowerCase() + "s"}{" "}
            in this filter.
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setFilter("ALL")}
          >
            Show all
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/30">
          {visible.map((item) => {
            const windowLabel = formatWindow(item.startDate, item.endDate);
            const secondary = secondaryHref(item);
            const busy = pending || togglingId === item.id;

            return (
              <li
                key={item.id}
                className="px-3 py-3 transition-colors hover:bg-muted/25 sm:px-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                      item.isActive
                        ? "border-brand/30 bg-brand/10 text-foreground"
                        : "border-border bg-muted/50 text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    <TypeIcon type={item.type} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="font-normal">
                        {typeLabel(item.type)}
                      </Badge>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px]",
                          item.isActive
                            ? "border-brand/30 bg-brand/10 text-foreground"
                            : "border-border bg-muted/60 text-muted-foreground",
                        )}
                      >
                        {item.isActive ? "Released" : "Inactive"}
                      </span>
                    </div>
                    <Link
                      href={item.href}
                      className="mt-1 block truncate text-sm font-medium text-foreground hover:underline hover:underline-offset-2"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.sectionNames.length > 0
                        ? item.sectionNames.join(" · ")
                        : "No section assigned"}
                      {windowLabel ? ` · ${windowLabel}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {secondary ? (
                      <Button asChild size="sm" variant="ghost" className="h-8">
                        <Link href={secondary}>
                          {item.type === "QUIZ" ? (
                            <BarChart3 />
                          ) : (
                            <SquareArrowOutUpRight />
                          )}
                          <span className="hidden sm:inline">
                            {item.type === "QUIZ" ? "Results" : "Open"}
                          </span>
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={busy}
                      onClick={() => void toggleRelease(item)}
                    >
                      {item.isActive ? <EyeOff /> : <Eye />}
                      <span className="hidden sm:inline">
                        {item.isActive ? "Unrelease" : "Release"}
                      </span>
                    </Button>
                    {item.type !== "LESSON" && entityIdForActivity(item) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={busy}
                        onClick={() => setAssignTarget(item)}
                      >
                        <Layers />
                        <span className="hidden sm:inline">
                          {item.sectionIds.length > 0
                            ? "Sections"
                            : "Assign"}
                        </span>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" className="h-8">
                      <Link href={item.href}>
                        <Pencil />
                        Edit
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 px-0"
                          aria-label={`More actions for ${item.title}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                          <Link href={item.href}>Edit content</Link>
                        </DropdownMenuItem>
                        {secondary ? (
                          <DropdownMenuItem asChild>
                            <Link href={secondary}>
                              {item.type === "QUIZ"
                                ? "View results"
                                : "Open discussion"}
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                        {item.type !== "LESSON" &&
                        entityIdForActivity(item) ? (
                          <DropdownMenuItem
                            disabled={busy}
                            onClick={() => setAssignTarget(item)}
                          >
                            <Layers className="h-4 w-4" />
                            Assign sections
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={busy}
                          onClick={() => void toggleRelease(item)}
                        >
                          {item.isActive
                            ? "Hide from students"
                            : "Release to students"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {assignTarget && entityIdForActivity(assignTarget) ? (
        <AssignSectionsDialog
          open={Boolean(assignTarget)}
          onOpenChange={(open) => {
            if (!open) setAssignTarget(null);
          }}
          title={`Sections · ${assignTarget.title}`}
          description="Students in these sections will see this assignment when you release it."
          activityType={assignTarget.type}
          entityId={entityIdForActivity(assignTarget)!}
          sectionOptions={sectionOptions}
          initialSectionIds={assignTarget.sectionIds}
          onSaved={(sectionIds) => {
            const nameById = new Map(
              sectionOptions.map((s) => [s.id, s.title]),
            );
            setActivities((prev) =>
              prev.map((a) =>
                a.id === assignTarget.id
                  ? {
                      ...a,
                      sectionIds,
                      sectionNames: sectionIds
                        .map((id) => nameById.get(id))
                        .filter(Boolean) as string[],
                    }
                  : a,
              ),
            );
            setAssignTarget(null);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </div>
  );
}
