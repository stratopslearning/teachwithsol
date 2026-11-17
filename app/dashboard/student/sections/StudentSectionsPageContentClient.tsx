"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Layers } from "@/components/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appPath } from "@/lib/basePath";
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
import { PageControls } from "@/components/patterns/PageControls";

const ROWS_PER_PAGE = 10;

export default function StudentSectionsPageContentClient({
  sectionsList,
}: {
  sectionsList: {
    id: string;
    name: string;
    courseId: string | null;
    course?: { id: string; title: string } | null;
  }[];
}) {
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);

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

  const filteredSections = useMemo(() => {
    return sectionsList.filter((section) => {
      const matchesSearch =
        !search ||
        section.name.toLowerCase().includes(search.toLowerCase()) ||
        (section.course?.title?.toLowerCase() || "").includes(
          search.toLowerCase(),
        );
      const matchesCourse =
        courseFilter === "ALL" || section.courseId === courseFilter;
      return matchesSearch && matchesCourse;
    });
  }, [sectionsList, search, courseFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredSections.length / ROWS_PER_PAGE),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedSections = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredSections.slice(start, start + ROWS_PER_PAGE);
  }, [filteredSections, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [search, courseFilter]);

  if (sectionsList.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        eyebrow="Not enrolled"
        title="No sections yet."
        description="Use the enrollment form above to join a section using the code your professor shared."
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
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSections.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-ink-muted py-8"
                >
                  No sections found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedSections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={appPath(
                        `/dashboard/student/sections/${section.id}`,
                      )}
                      className="text-ink underline-offset-2 hover:underline"
                    >
                      {section.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {section.course?.title || "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="success">Enrolled</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Button asChild size="sm">
                        <Link
                          href={appPath(
                            `/dashboard/student/sections/${section.id}`,
                          )}
                        >
                          Open
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

      <PageControls page={currentPage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
