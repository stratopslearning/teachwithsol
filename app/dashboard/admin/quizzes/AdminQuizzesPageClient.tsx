"use client";

import { apiFetch } from "@/lib/api/client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "@/components/icons";
import { toast } from "sonner";

import { QuizEditForm } from "@/components/quiz/QuizEditForm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/patterns/LoadingState";
import {
  LocalDateTime,
  TIMESTAMP_CELL_CLASS,
} from "@/components/timezone/LocalDateTime";
import { withBasePath } from "@/lib/basePath";
import { confirmAction } from "@/components/feedback/ConfirmDialog";
import { useRouter } from "next/navigation";
import { PageControls } from "@/components/patterns/PageControls";

const ROWS_PER_PAGE = 15;
type SortMode = "DEFAULT" | "DUE_ASC" | "DUE_DESC";

function dueTime(value: string | Date | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function sortByDueDate<T extends { endDate?: string | Date | null }>(
  quizzes: T[],
  sortMode: SortMode,
) {
  if (sortMode === "DEFAULT") return quizzes;
  return [...quizzes].sort((a, b) => {
    const aDue = dueTime(a.endDate);
    const bDue = dueTime(b.endDate);
    if (aDue == null && bDue == null) return 0;
    if (aDue == null) return 1;
    if (bDue == null) return -1;
    return sortMode === "DUE_ASC" ? aDue - bDue : bDue - aDue;
  });
}

export default function AdminQuizzesPageClient({
  allSections,
  allQuizzes,
  allQuizSections,
}: {
  allSections: any[];
  allQuizzes: any[];
  allQuizSections: any[];
}) {
  const router = useRouter();
  const [quizzesWithQuestions, setQuizzesWithQuestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sectionFilter, setSectionFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("DEFAULT");
  const [page, setPage] = useState(1);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);

  const courseOptions = allSections.map((section) => ({
    id: section.id,
    title: `${section.name} (${section.course?.title || "Unknown"})`,
  }));

  const flatQuizzes = useMemo(() => {
    return quizzesWithQuestions.map((quiz) => {
      const sectionIds = allQuizSections
        .filter((qs) => qs.quizId === quiz.id)
        .map((qs) => qs.sectionId);
      const sectionNames = sectionIds
        .map((sid) => allSections.find((s) => s.id === sid)?.name)
        .filter(Boolean) as string[];
      return {
        ...quiz,
        assignedSectionIds: sectionIds,
        assignedSectionNames: sectionNames,
      };
    });
  }, [quizzesWithQuestions, allQuizSections, allSections]);

  const filteredQuizzes = useMemo(() => {
    const filtered = flatQuizzes.filter((quiz) => {
      const matchesSearch =
        !search || quiz.title.toLowerCase().includes(search.toLowerCase());
      const matchesSection =
        sectionFilter === "ALL" ||
        quiz.assignedSectionIds.includes(sectionFilter);
      return matchesSearch && matchesSection;
    });
    return sortByDueDate(filtered, sortMode);
  }, [flatQuizzes, search, sectionFilter, sortMode]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredQuizzes.length / ROWS_PER_PAGE),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedQuizzes = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredQuizzes.slice(start, start + ROWS_PER_PAGE);
  }, [filteredQuizzes, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [search, sectionFilter, sortMode]);

  useEffect(() => {
    async function loadQuizQuestions() {
      try {
        const data = await Promise.all(
          allQuizzes.map(async (quiz) => {
            const res = await apiFetch(`/api/quiz/${quiz.id}/questions`);
            if (res.ok) {
              const json = await res.json();
              return { ...quiz, questions: json.questions || [] };
            }
            return { ...quiz, questions: [] };
          }),
        );
        setQuizzesWithQuestions(data);
      } catch (error) {
        console.error("Error loading quiz questions:", error);
        setQuizzesWithQuestions(
          allQuizzes.map((q) => ({ ...q, questions: [] })),
        );
      } finally {
        setIsLoading(false);
      }
    }
    loadQuizQuestions();
  }, [allQuizzes]);

  async function handleDeleteQuiz(quizId: string) {
    if (!await confirmAction("Are you sure you want to delete this quiz?")) return;
    try {
      const res = await apiFetch(`/api/admin/quiz/${quizId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Quiz deleted successfully");
        router.refresh();
      } else {
        toast.error("Failed to delete quiz");
      }
    } catch (error) {
      console.error("Error deleting quiz:", error);
      toast.error("Failed to delete quiz");
    }
  }

  async function handleUnassignQuiz(quizId: string, sectionId: string) {
    if (
      !await confirmAction("Are you sure you want to unassign this quiz from this section?")
    )
      return;
    try {
      const res = await apiFetch(`/api/admin/quiz/${quizId}/section/${sectionId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast.success("Quiz unassigned from section");
        router.refresh();
      } else {
        toast.error("Failed to unassign quiz from section");
      }
    } catch (error) {
      console.error("Error unassigning quiz:", error);
      toast.error("Failed to unassign quiz from section");
    }
  }

  function handleEditSuccess() {
    setEditingQuizId(null);
    toast.success("Quiz updated successfully");
    router.refresh();
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Overview", href: withBasePath("/dashboard/admin") },
          { label: "Assignments" },
        ]}
        eyebrow="Assignments"
        title="Quizzes"
        description="Quiz audit for the default workspace. Faculty author lessons and discussions in their own workspace."
        actions={
          <Button asChild>
            <Link href="/dashboard/admin/quizzes/new">
              <Plus className="h-4 w-4" />
              New quiz
            </Link>
          </Button>
        }
      />

      <p className="mt-4 text-xs text-ink-faint">
        Scoped to the default workspace catalog.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="md:w-56">
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sections</SelectItem>
                {allSections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:w-52">
            <Select
              value={sortMode}
              onValueChange={(value) => setSortMode(value as SortMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sort by due date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEFAULT">Default order</SelectItem>
                <SelectItem value="DUE_ASC">Due date: earliest</SelectItem>
                <SelectItem value="DUE_DESC">Due date: latest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            type="search"
            placeholder="Search by quiz title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
        </div>

        {isLoading ? (
          <LoadingState label="Loading quizzes" variant="page" />
        ) : (
          <div className="paper paper-shadow overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Sections</TableHead>
                    <TableHead className="min-w-[13rem]">Due</TableHead>
                    <TableHead className="tnum">Attempts</TableHead>
                    <TableHead className="tnum">Time limit</TableHead>
                    <TableHead className="tnum">Questions</TableHead>
                    <TableHead className="sticky right-0 z-10 bg-surface-sunken/95 px-3 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedQuizzes.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-ink-muted py-8"
                      >
                        No quizzes found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedQuizzes.map((quiz) => {
                      const sectionsLabel =
                        quiz.assignedSectionNames.length > 0
                          ? quiz.assignedSectionNames.join(", ")
                          : "Unassigned";
                      return (
                        <TableRow key={quiz.id}>
                          <TableCell className="font-medium align-top">
                            <div className="flex flex-col min-w-0">
                              <span className="truncate" title={quiz.title}>
                                {quiz.title}
                              </span>
                              {quiz.description ? (
                                <span
                                  className="text-xs text-ink-muted truncate mt-0.5"
                                  title={quiz.description ?? ''}
                                >
                                  {quiz.description}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-ink-muted text-sm align-top">
                            <span
                              className="block truncate"
                              title={sectionsLabel}
                            >
                              {sectionsLabel}
                            </span>
                          </TableCell>
                          <TableCell className={`text-sm text-ink-muted ${TIMESTAMP_CELL_CLASS}`}>
                            {quiz.endDate ? (
                              <LocalDateTime stacked value={quiz.endDate} />
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="tnum text-ink-muted align-top">
                            {quiz.maxAttempts ?? "-"}
                          </TableCell>
                          <TableCell className="tnum text-ink-muted align-top">
                            {quiz.timeLimit != null
                              ? `${quiz.timeLimit} min`
                              : "-"}
                          </TableCell>
                          <TableCell className="tnum text-ink-muted align-top">
                            {quiz.questions?.length ?? 0}
                          </TableCell>
                          <TableCell className="sticky right-0 z-10 bg-paper px-3 text-right align-top">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingQuizId(quiz.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteQuiz(quiz.id)}
                              >
                                Delete
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="iconSm"
                                    variant="outline"
                                    disabled={
                                      quiz.assignedSectionIds.length === 0
                                    }
                                    aria-label="More actions"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                {quiz.assignedSectionIds.length > 0 ? (
                                  <DropdownMenuContent align="end">
                                    {quiz.assignedSectionIds.map(
                                      (sectionId: string) => {
                                        const section = allSections.find(
                                          (s) => s.id === sectionId,
                                        );
                                        return (
                                          <DropdownMenuItem
                                            key={sectionId}
                                            onClick={() =>
                                              handleUnassignQuiz(
                                                quiz.id,
                                                sectionId,
                                              )
                                            }
                                          >
                                            Unassign from{" "}
                                            {section?.name ?? sectionId}
                                          </DropdownMenuItem>
                                        );
                                      },
                                    )}
                                  </DropdownMenuContent>
                                ) : null}
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <PageControls page={currentPage} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {editingQuizId
        ? (() => {
            const quiz = quizzesWithQuestions.find(
              (q) => q.id === editingQuizId,
            );
            return quiz ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
                <div className="bg-surface text-ink rounded-lg paper-shadow-lg border border-rule p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                  <QuizEditForm
                    quiz={{ ...quiz, questions: quiz.questions ?? [] }}
                    courses={courseOptions}
                    apiEndpoint={`/api/admin/quiz/${quiz.id}/update`}
                    onSuccess={handleEditSuccess}
                    assignedSectionIds={allQuizSections
                      .filter((qs) => qs.quizId === quiz.id)
                      .map((qs) => qs.sectionId)}
                  />
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => setEditingQuizId(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : null;
          })()
        : null}
    </>
  );
}
