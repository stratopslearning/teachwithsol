"use client";

import { apiFetch } from "@/lib/api/client";
import React, { useState } from "react";
import { Edit, Plus, Trash2 } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type Section = {
  id: string;
  name: string;
  professorEnrollmentCode: string;
  studentEnrollmentCode: string;
  endsAt?: Date | string | null;
};

function extractLocalDateAndTime(
  date: Date | string | null | undefined,
): { date: string; time: string } {
  if (!date) return { date: "", time: "" };
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(dateObj.getTime())) return { date: "", time: "" };
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function combineLocalDateTime(date: string, time: string): string | null {
  if (!date) return null;
  if (!time) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day, 23, 59, 0).toISOString();
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0).toISOString();
}

type Mode = "create" | "edit" | "delete";

export function SectionFormModal({
  mode,
  courseId: initialCourseId,
  section,
  bulk,
  allCourses,
}: {
  mode: Mode;
  courseId?: string;
  section?: Section;
  bulk?: boolean;
  allCourses?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initialEnds = extractLocalDateAndTime(section?.endsAt);
  const [name, setName] = useState(section?.name || "");
  const [endsDate, setEndsDate] = useState(initialEnds.date);
  const [endsTime, setEndsTime] = useState(initialEnds.time || "23:59");
  const [bulkNames, setBulkNames] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdSectionId, setCreatedSectionId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState(
    initialCourseId || (allCourses && allCourses[0]?.id) || "",
  );
  const isEdit = mode === "edit";
  const isDelete = mode === "delete";
  const isCreate = mode === "create";
  const isBulk = !!bulk;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setCreatedSectionId(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      if (isCreate && isBulk) {
        const names = bulkNames
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean);
        if (names.length === 0) {
          toast.error("Please enter at least one section name");
          setLoading(false);
          return;
        }
        const res = await apiFetch(`/api/admin/section/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names, courseId }),
        });
        if (res.ok) {
          toast.success(`Created ${names.length} sections`);
          setOpen(false);
          router.refresh();
        } else {
          toast.error("Failed to create sections");
        }
      } else if (isCreate) {
        const endsAt = combineLocalDateTime(endsDate, endsTime);
        const res = await apiFetch(`/api/admin/section`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, courseId, endsAt }),
        });
        if (!res.ok) {
          toast.error("Failed to create section");
          return;
        }
        const data = (await res.json()) as { section?: { id: string } };
        setCreatedSectionId(data.section?.id ?? null);
        toast.success("Section created");
        router.refresh();
        if (!data.section?.id) setOpen(false);
      } else if (isEdit && section) {
        const endsAt = combineLocalDateTime(endsDate, endsTime);
        const res = await apiFetch(`/api/admin/section/${section.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, endsAt }),
        });
        if (!res.ok) {
          toast.error("Failed to update section");
          return;
        }
        toast.success("Section updated");
        setOpen(false);
        router.refresh();
      } else if (isDelete && section) {
        const res = await apiFetch(`/api/admin/section/${section.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          toast.error("Failed to delete section");
          return;
        }
        toast.success("Section deleted");
        setOpen(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  let trigger;
  if (isCreate && isBulk) {
    trigger = (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Bulk create
      </Button>
    );
  } else if (isCreate) {
    trigger = (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New section
      </Button>
    );
  } else if (isEdit) {
    trigger = (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Edit className="h-4 w-4" /> Edit
      </Button>
    );
  } else if (isDelete) {
    trigger = (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <span className="eyebrow text-ink-faint">
            {isCreate ? (isBulk ? "Bulk" : "New") : isEdit ? "Revise" : "Remove"}
          </span>
          <DialogTitle>
            {isCreate && isBulk && "Bulk create sections"}
            {isCreate && !isBulk && "Create a section"}
            {isEdit && "Edit section"}
            {isDelete && "Delete section"}
          </DialogTitle>
          {isDelete && section ? (
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="text-ink font-medium">{section.name}</span>? This
              cannot be undone.
            </DialogDescription>
          ) : createdSectionId ? (
            <DialogDescription>
              Section created.{" "}
              <Link
                href={`/dashboard/admin/sections/${createdSectionId}`}
                className="text-brand underline underline-offset-4"
              >
                View section details
              </Link>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {!isDelete && !createdSectionId ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isCreate && allCourses && allCourses.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="course-select">Course</Label>
                <Select
                  value={courseId}
                  onValueChange={setCourseId}
                  disabled={loading}
                >
                  <SelectTrigger id="course-select">
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {allCourses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {isCreate && isBulk ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk-names">Section names</Label>
                <Textarea
                  id="bulk-names"
                  placeholder="One per line, e.g.&#10;Section A&#10;Section B"
                  value={bulkNames}
                  onChange={(e) => setBulkNames(e.target.value)}
                  rows={6}
                  disabled={loading}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="section-name">Section name</Label>
                <Input
                  id="section-name"
                  placeholder="e.g. Section 01"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            )}

            {!isBulk ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="section-ends-date">Section end date</Label>
                  <Input
                    id="section-ends-date"
                    type="date"
                    value={endsDate}
                    onChange={(e) => setEndsDate(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="section-ends-time">End time</Label>
                  <Input
                    id="section-ends-time"
                    type="time"
                    value={endsTime}
                    onChange={(e) => setEndsTime(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <p className="sm:col-span-2 text-xs text-ink-muted">
                  Optional. After this moment, students see the section as past /
                  archived and cannot start new work.
                </p>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading} loading={loading}>
                {isCreate && isBulk && "Create sections"}
                {isCreate && !isBulk && "Create section"}
                {isEdit && "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        ) : createdSectionId ? (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button asChild>
              <Link
                href={`/dashboard/admin/sections/${createdSectionId}`}
              >
                View section
              </Link>
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleSubmit()}
              disabled={loading}
              loading={loading}
            >
              Delete section
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
