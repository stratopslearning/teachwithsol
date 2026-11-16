"use client";

import React, { useCallback, useState } from "react";
import { BookOpen } from "@/components/icons";

import { AdminFilterBar } from "@/components/admin/AdminFilterBar";
import { CourseFormModal } from "@/components/admin/CourseFormModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/patterns/EmptyState";
import { useFilteredSortedPage } from "@/hooks/useFilteredSortedPage";
import { compareStringsIgnoreCase } from "@/lib/listSort";
import { PageControls } from "@/components/patterns/PageControls";

const ROWS_PER_PAGE = 15;

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  sectionCount: number;
  createdAt?: string | Date | null;
};

type CourseSortMode = "TITLE" | "SECTIONS" | "CREATED_DESC" | "CREATED_ASC";

function courseCompare(a: CourseRow, b: CourseRow, mode: CourseSortMode) {
  switch (mode) {
    case "SECTIONS":
      return a.sectionCount - b.sectionCount;
    case "CREATED_DESC":
      return (
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime()
      );
    case "CREATED_ASC":
      return (
        new Date(a.createdAt ?? 0).getTime() -
        new Date(b.createdAt ?? 0).getTime()
      );
    case "TITLE":
    default:
      return compareStringsIgnoreCase(a.title, b.title);
  }
}

export default function AdminCoursesPageContentClient({
  courses,
}: {
  courses: CourseRow[];
}) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<CourseSortMode>("TITLE");

  const {
    page,
    setPage,
    totalPages,
    paginated: paginatedCourses,
  } = useFilteredSortedPage({
    rows: courses,
    search,
    filterFn: useCallback((c: CourseRow, q: string) => {
      if (!q.trim()) return true;
      const lower = q.toLowerCase();
      return (
        c.title.toLowerCase().includes(lower) ||
        (c.description?.toLowerCase() || "").includes(lower)
      );
    }, []),
    compareFn: useCallback(
      (a: CourseRow, b: CourseRow) => courseCompare(a, b, sortMode),
      [sortMode],
    ),
    rowsPerPage: ROWS_PER_PAGE,
  });

  if (courses.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-5 w-5" />}
        eyebrow="Empty"
        title="No courses yet."
        description="Create your first course to begin organising sections, learners, and quizzes."
        actions={<CourseFormModal mode="create" />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by title or description…"
        filterValue={sortMode}
        onFilterChange={(v) => setSortMode(v as CourseSortMode)}
        filterLabel="Sort"
        filterOptions={[
          { value: "TITLE", label: "Title A–Z" },
          { value: "SECTIONS", label: "Section count" },
          { value: "CREATED_DESC", label: "Created (newest)" },
          { value: "CREATED_ASC", label: "Created (oldest)" },
        ]}
      />

      <div className="paper paper-shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Sections</TableHead>
              <TableHead className="sticky right-0 z-10 bg-surface-sunken/95 px-3 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCourses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-ink-muted py-8"
                >
                  No courses found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedCourses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="font-medium">{course.title}</TableCell>
                  <TableCell className="text-ink-muted max-w-md truncate">
                    {course.description || "-"}
                  </TableCell>
                  <TableCell className="tnum">{course.sectionCount}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-paper px-3 text-right align-middle">
                    <div className="inline-flex gap-1">
                      <CourseFormModal
                        mode="edit"
                        course={{
                          id: course.id,
                          title: course.title,
                          description: course.description ?? undefined,
                        }}
                      />
                      <CourseFormModal
                        mode="delete"
                        course={{
                          id: course.id,
                          title: course.title,
                          description: course.description ?? undefined,
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PageControls page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
