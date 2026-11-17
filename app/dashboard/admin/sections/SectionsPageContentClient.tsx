"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { Eye, GraduationCap } from "@/components/icons";

import CopyEnrollmentButton from "@/components/CopyEnrollmentButton";
import { SectionFormModal } from "@/components/admin/SectionFormModal";
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
import { PageHeader } from "@/components/layout/PageHeader";
import { useFilteredSortedPage } from "@/hooks/useFilteredSortedPage";
import { withBasePath } from "@/lib/basePath";
import { compareDates, compareStringsIgnoreCase } from "@/lib/listSort";
import { PageControls } from "@/components/patterns/PageControls";

const ROWS_PER_PAGE = 15;

type SectionRow = {
  id: string;
  name: string;
  courseId: string;
  professorEnrollmentCode: string;
  studentEnrollmentCode: string;
  endsAt?: string | Date | null;
  createdAt: string | Date;
  learnerCount: number;
  facultyCount: number;
  course?: { id: string; title: string } | null;
};

type SectionSortMode =
  | "NAME"
  | "COURSE"
  | "LEARNERS"
  | "FACULTY"
  | "CREATED_DESC"
  | "CREATED_ASC";

function sectionCompare(a: SectionRow, b: SectionRow, mode: SectionSortMode) {
  switch (mode) {
    case "COURSE":
      return compareStringsIgnoreCase(
        a.course?.title ?? "",
        b.course?.title ?? "",
      );
    case "LEARNERS":
      return a.learnerCount - b.learnerCount;
    case "FACULTY":
      return a.facultyCount - b.facultyCount;
    case "CREATED_DESC":
      return compareDates(b.createdAt, a.createdAt);
    case "CREATED_ASC":
      return compareDates(a.createdAt, b.createdAt);
    case "NAME":
    default:
      return compareStringsIgnoreCase(a.name, b.name);
  }
}

export default function SectionsPageContentClient({
  allSections,
  allCourses,
  pastSectionsHref,
  pastSectionsCount = 0,
}: {
  allSections: SectionRow[];
  allCourses: { id: string; title: string }[];
  pastSectionsHref?: string;
  pastSectionsCount?: number;
}) {
  const [filter, setFilter] = useState("");
  const [courseId, setCourseId] = useState<string>("ALL");
  const [sortMode, setSortMode] = useState<SectionSortMode>("NAME");

  const {
    page,
    setPage,
    totalPages,
    paginated: paginatedSections,
  } = useFilteredSortedPage({
    rows: allSections,
    search: filter,
    filterFn: useCallback((section: SectionRow, q: string) => {
      const matchesSearch =
        !q.trim() ||
        section.name.toLowerCase().includes(q.toLowerCase()) ||
        section.professorEnrollmentCode
          .toLowerCase()
          .includes(q.toLowerCase()) ||
        section.studentEnrollmentCode
          .toLowerCase()
          .includes(q.toLowerCase()) ||
        (section.course?.title?.toLowerCase() || "").includes(q.toLowerCase());
      const matchesCourse =
        courseId === "ALL" || section.courseId === courseId;
      return matchesSearch && matchesCourse;
    }, [courseId]),
    compareFn: useCallback(
      (a: SectionRow, b: SectionRow) => sectionCompare(a, b, sortMode),
      [sortMode],
    ),
    rowsPerPage: ROWS_PER_PAGE,
  });

  useEffect(() => {
    setPage(1);
  }, [courseId, sortMode, setPage]);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Overview", href: withBasePath("/dashboard/admin") },
          { label: "Sections" },
        ]}
        eyebrow="Catalog"
        title="Sections"
        description="Ongoing sections in the default workspace. Enrolment codes for faculty and learners."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pastSectionsHref ? (
              <Button asChild variant="outline">
                <Link href={pastSectionsHref}>
                  View past sections
                  {pastSectionsCount > 0 ? ` (${pastSectionsCount})` : ""}
                </Link>
              </Button>
            ) : null}
            <SectionFormModal mode="create" allCourses={allCourses} />
            <SectionFormModal mode="create" bulk allCourses={allCourses} />
          </div>
        }
      />

      <p className="mt-4 text-xs text-ink-faint">
        Scoped via ?workspaceId= (default workspace when omitted).
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="md:w-56">
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All courses</SelectItem>
                {allCourses.map((c) => (
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
              <SelectItem value="FACULTY">Faculty</SelectItem>
              <SelectItem value="CREATED_DESC">Created (newest)</SelectItem>
              <SelectItem value="CREATED_ASC">Created (oldest)</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="search"
            placeholder="Search by section, course, or code…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
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
                <TableHead className="tnum">Faculty</TableHead>
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
                    colSpan={7}
                    className="text-center text-ink-muted py-8"
                  >
                    No sections found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSections.map((section) => (
                  <TableRow key={section.id}>
                    <TableCell className="font-medium">
                      {section.name}
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {section.course?.title || "Unknown"}
                    </TableCell>
                    <TableCell className="tnum">{section.learnerCount}</TableCell>
                    <TableCell className="tnum">{section.facultyCount}</TableCell>
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
                      <div className="inline-flex items-center gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`/dashboard/admin/sections/${section.id}`}
                          >
                            <Eye className="h-4 w-4" />
                            Details
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`/dashboard/admin/sections/${section.id}/gradebook`}
                          >
                            <GraduationCap className="h-4 w-4" />
                            Gradebook
                          </Link>
                        </Button>
                        <SectionFormModal
                          mode="edit"
                          section={section}
                          allCourses={allCourses}
                        />
                        <SectionFormModal mode="delete" section={section} />
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
    </>
  );
}
