"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Layers } from "@/components/icons";

import CopyEnrollmentButton from "@/components/CopyEnrollmentButton";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/patterns/EmptyState";
import { useFilteredSortedPage } from "@/hooks/useFilteredSortedPage";
import { compareStringsIgnoreCase } from "@/lib/listSort";
import { PageControls } from "@/components/patterns/PageControls";

const ROWS_PER_PAGE = 10;

type SectionRow = {
  id: string;
  name: string;
  courseId: string;
  professorEnrollmentCode: string;
  studentEnrollmentCode: string;
  learnerCount: number;
  course?: { id: string; title: string } | null;
};

type SectionSortMode = "NAME" | "COURSE" | "LEARNERS";

function sectionCompare(a: SectionRow, b: SectionRow, mode: SectionSortMode) {
  switch (mode) {
    case "COURSE":
      return compareStringsIgnoreCase(
        a.course?.title ?? "",
        b.course?.title ?? "",
      );
    case "LEARNERS":
      return a.learnerCount - b.learnerCount;
    case "NAME":
    default:
      return compareStringsIgnoreCase(a.name, b.name);
  }
}

export default function ProfessorSectionsPageContentClient({
  sectionsList,
}: {
  sectionsList: SectionRow[];
}) {
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("ALL");
  const [sortMode, setSortMode] = useState<SectionSortMode>("NAME");

  const courses = useMemo(() => {
    const seen = new Set<string>();
    return sectionsList
      .map((s) => s.course)
      .filter((c): c is NonNullable<typeof c> => c != null)
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
  }, [sectionsList]);

  const {
    page,
    setPage,
    totalPages,
    paginated: paginatedSections,
  } = useFilteredSortedPage({
    rows: sectionsList,
    search,
    filterFn: useCallback(
      (section: SectionRow, q: string) => {
        const matchesSearch =
          !q.trim() ||
          section.name.toLowerCase().includes(q.toLowerCase()) ||
          (section.course?.title?.toLowerCase() || "").includes(q.toLowerCase());
        const matchesCourse =
          courseFilter === "ALL" || section.courseId === courseFilter;
        return matchesSearch && matchesCourse;
      },
      [courseFilter],
    ),
    compareFn: useCallback(
      (a: SectionRow, b: SectionRow) => sectionCompare(a, b, sortMode),
      [sortMode],
    ),
    rowsPerPage: ROWS_PER_PAGE,
  });

  useEffect(() => {
    setPage(1);
  }, [search, courseFilter, sortMode, setPage]);

  if (sectionsList.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        eyebrow="Empty"
        title="No sections yet."
        description="Create a course and section in Workspace, or join with a faculty enrollment code from a colleague."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="md:w-56">
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select
          value={sortMode}
          onValueChange={(v) => setSortMode(v as SectionSortMode)}
        >
          <SelectTrigger className="md:w-48">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NAME">Section name A–Z</SelectItem>
            <SelectItem value="COURSE">Course A–Z</SelectItem>
            <SelectItem value="LEARNERS">Learners</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="search"
          placeholder="Search sections or courses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
      </div>

      <div className="paper paper-shadow overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Section</TableHead>
              <TableHead>Course</TableHead>
              <TableHead className="tnum">Learners</TableHead>
              <TableHead>Faculty code</TableHead>
              <TableHead>Learner code</TableHead>
              <TableHead className="sticky right-0 z-10 bg-surface-sunken/95 px-3 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSections.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-ink-muted py-8"
                >
                  No sections found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedSections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell className="font-medium">{section.name}</TableCell>
                  <TableCell className="text-ink-muted">
                    {section.course?.title || "Unknown"}
                  </TableCell>
                  <TableCell className="tnum">{section.learnerCount}</TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-2">
                      <code className="font-mono text-xs bg-surface-sunken text-ink px-2 py-1 rounded border border-rule">
                        {section.professorEnrollmentCode}
                      </code>
                      <CopyEnrollmentButton
                        code={section.professorEnrollmentCode}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-2">
                      <code className="font-mono text-xs bg-surface-sunken text-ink px-2 py-1 rounded border border-rule">
                        {section.studentEnrollmentCode}
                      </code>
                      <CopyEnrollmentButton
                        code={section.studentEnrollmentCode}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="sticky right-0 z-10 bg-paper px-3 text-right align-middle">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/dashboard/professor/sections/${section.id}/gradebook`}
                        >
                          Gradebook
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/dashboard/professor/courses/${section.courseId}/sections/${section.id}`}
                        >
                          Details
                        </Link>
                      </Button>
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
