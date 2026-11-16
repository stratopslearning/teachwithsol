"use client";

import { apiFetch } from "@/lib/api/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SectionMultiSelect } from "@/components/ui/SectionMultiSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActivityType } from "@/lib/assignments";

export type SectionOption = { id: string; title: string };

export function AssignSectionsDialog({
  open,
  onOpenChange,
  title,
  description,
  activityType,
  entityId,
  sectionOptions,
  initialSectionIds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  activityType: ActivityType;
  entityId: string;
  sectionOptions: SectionOption[];
  initialSectionIds: string[];
  onSaved?: (sectionIds: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>(initialSectionIds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValue(initialSectionIds);
  }, [open, initialSectionIds]);

  async function save() {
    setSaving(true);
    try {
      const res = await apiFetch("/api/professor/activity/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activityType,
          entityId,
          sectionIds: value,
          mode: "replace",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not update sections");
        return;
      }
      const nextIds = (data.sectionIds as string[] | undefined) ?? value;
      toast.success(
        nextIds.length === 0
          ? "Removed from all sections"
          : `Assigned to ${nextIds.length} section${nextIds.length === 1 ? "" : "s"}`,
      );
      onSaved?.(nextIds);
      onOpenChange(false);
    } catch {
      toast.error("Could not update sections");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              "Choose which sections should receive this assignment."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {sectionOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teachable sections for this course yet. Create a section first.
            </p>
          ) : (
            <SectionMultiSelect
              options={sectionOptions}
              value={value}
              onChange={setValue}
              placeholder="Select sections…"
            />
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || sectionOptions.length === 0}
          >
            {saving ? "Saving…" : "Save sections"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
