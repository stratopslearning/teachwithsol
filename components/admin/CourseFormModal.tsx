"use client";

import { apiFetch } from "@/lib/api/client";
import React, { useState } from "react";
import { Edit, Plus, Trash2 } from "@/components/icons";
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
import { Textarea } from "@/components/ui/textarea";

export type Course = {
  id: string;
  title: string;
  description?: string;
};

type Mode = "create" | "edit" | "delete";

export function CourseFormModal({
  mode,
  course,
}: {
  mode: Mode;
  course?: Course;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState(course?.title || "");
  const [description, setDescription] = useState(course?.description || "");
  const [sectionNames, setSectionNames] = useState("");
  const [loading, setLoading] = useState(false);
  const isEdit = mode === "edit";
  const isDelete = mode === "delete";
  const isCreate = mode === "create";

  const resetForm = () => {
    setStep(1);
    setSectionNames("");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetForm();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      if (isCreate) {
        const res = await apiFetch("/api/admin/course", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        });
        if (!res.ok) {
          toast.error("Failed to create course");
          return;
        }
        const data = (await res.json()) as { course?: { id: string } };
        const courseId = data.course?.id;
        const names = sectionNames
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean);
        if (courseId && names.length > 0) {
          const bulkRes = await apiFetch("/api/admin/section/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names, courseId }),
          });
          if (!bulkRes.ok) {
            toast.error("Course created, but sections failed to create");
          } else {
            toast.success(`Course created with ${names.length} sections`);
          }
        } else {
          toast.success("Course created");
        }
      } else if (isEdit && course) {
        const res = await apiFetch(`/api/admin/course/${course.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        });
        if (!res.ok) {
          toast.error("Failed to update course");
          return;
        }
        toast.success("Course updated");
      } else if (isDelete && course) {
        const res = await apiFetch(`/api/admin/course/${course.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          toast.error("Failed to delete course");
          return;
        }
        toast.success("Course deleted");
      }
      setOpen(false);
      resetForm();
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  let trigger;
  if (isCreate) {
    trigger = (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New course
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
            {isCreate ? (step === 1 ? "Step 1" : "Step 2") : isEdit ? "Revise" : "Remove"}
          </span>
          <DialogTitle>
            {isCreate && step === 1 && "Create a course"}
            {isCreate && step === 2 && "Add sections (optional)"}
            {isEdit && "Edit course"}
            {isDelete && "Delete course"}
          </DialogTitle>
          {isDelete && course ? (
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="text-ink font-medium">{course.title}</span>? This
              cannot be undone.
            </DialogDescription>
          ) : isCreate && step === 2 ? (
            <DialogDescription>
              Add one section name per line, or skip to create the course only.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {!isDelete ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isCreate && step === 1) {
                setStep(2);
                return;
              }
              void handleSubmit(e);
            }}
            className="flex flex-col gap-4"
          >
            {(!isCreate || step === 1) && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="course-title">Title</Label>
                  <Input
                    id="course-title"
                    placeholder="e.g. Introduction to Algorithms"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="course-description">Description</Label>
                  <Textarea
                    id="course-description"
                    placeholder="A short summary of the course (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </>
            )}

            {isCreate && step === 2 ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="course-sections">Section names</Label>
                <Textarea
                  id="course-sections"
                  placeholder="One per line, e.g.&#10;Section A&#10;Section B"
                  value={sectionNames}
                  onChange={(e) => setSectionNames(e.target.value)}
                  rows={6}
                  disabled={loading}
                />
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (isCreate && step === 2) {
                    setStep(1);
                  } else {
                    setOpen(false);
                  }
                }}
                disabled={loading}
              >
                {isCreate && step === 2 ? "Back" : "Cancel"}
              </Button>
              <Button type="submit" disabled={loading} loading={loading}>
                {isCreate && step === 1
                  ? "Next"
                  : isCreate
                    ? sectionNames.trim()
                      ? "Create course & sections"
                      : "Create course"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
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
              Delete course
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
