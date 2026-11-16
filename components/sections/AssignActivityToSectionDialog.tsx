"use client";

import { apiFetch } from "@/lib/api/client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Plus } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActivityType } from "@/lib/assignments";
import { cn } from "@/lib/utils";

export type AssignableActivityOption = {
  type: Extract<ActivityType, "QUIZ" | "DISCUSSION" | "INTERACTIVE">;
  entityId: string;
  title: string;
  /** Already linked to this section */
  assigned: boolean;
};

function activityKey(a: Pick<AssignableActivityOption, "type" | "entityId">) {
  return `${a.type}:${a.entityId}`;
}

function typeLabel(type: AssignableActivityOption["type"]) {
  switch (type) {
    case "QUIZ":
      return "Quiz";
    case "DISCUSSION":
      return "Discussion";
    case "INTERACTIVE":
      return "Interactive";
    default:
      return type;
  }
}

export function AssignActivityToSectionDialog({
  sectionId,
  sectionName,
  activities,
}: {
  sectionId: string;
  sectionName: string;
  activities: AssignableActivityOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const available = useMemo(() => {
    const seen = new Set<string>();
    const out: AssignableActivityOption[] = [];
    for (const a of activities) {
      if (a.assigned) continue;
      const key = activityKey(a);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  }, [activities]);

  useEffect(() => {
    if (!open) setSelectedKeys([]);
  }, [open]);

  const selected = useMemo(
    () => available.filter((a) => selectedKeys.includes(activityKey(a))),
    [available, selectedKeys],
  );

  const allSelected =
    available.length > 0 && selectedKeys.length === available.length;

  function toggle(key: string, checked: boolean) {
    setSelectedKeys((prev) =>
      checked
        ? prev.includes(key)
          ? prev
          : [...prev, key]
        : prev.filter((k) => k !== key),
    );
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedKeys([]);
      return;
    }
    setSelectedKeys(available.map(activityKey));
  }

  async function save() {
    if (selected.length === 0) {
      toast.error("Pick at least one assignment");
      return;
    }
    setSaving(true);
    try {
      const results = await Promise.all(
        selected.map(async (item) => {
          const res = await apiFetch("/api/professor/activity/sections", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: item.type,
              entityId: item.entityId,
              sectionIds: [sectionId],
              sectionId,
              mode: "add",
            }),
          });
          const data = await res.json().catch(() => ({}));
          return { ok: res.ok, title: item.title, error: data.error as string | undefined };
        }),
      );
      const failed = results.filter((r) => !r.ok);
      const succeeded = results.length - failed.length;
      if (succeeded > 0) {
        toast.success(
          succeeded === 1
            ? `Added “${results.find((r) => r.ok)?.title}” to ${sectionName}`
            : `Added ${succeeded} assignments to ${sectionName}`,
        );
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? failed[0]!.error || `Could not assign “${failed[0]!.title}”`
            : `${failed.length} assignments could not be assigned`,
        );
      }
      if (succeeded > 0) {
        setOpen(false);
        setSelectedKeys([]);
        router.refresh();
      }
    } catch {
      toast.error("Could not assign to this section");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          Assign existing
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden sm:max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle className="pr-8">Assign to {sectionName}</DialogTitle>
          <DialogDescription>
            Select one or more quizzes, discussions, or interactives from this
            course that are not already on this section.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3 py-1">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {activities.length === 0
                ? "No assignable coursework on this course yet. Create one from Assignments or Authoring."
                : "Every course assignment is already on this section."}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={toggleAll}
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
                <span className="text-xs text-muted-foreground">
                  {selectedKeys.length} selected
                </span>
              </div>
              <div className="max-h-64 min-w-0 space-y-0.5 overflow-x-hidden overflow-y-auto rounded-md border border-border p-1.5">
                {available.map((a) => {
                  const key = activityKey(a);
                  const inputId = `assign-${a.type}-${a.entityId}`;
                  const checked = selectedKeys.includes(key);
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex min-w-0 items-center gap-2.5 rounded-md px-2 py-2 transition-colors",
                        checked ? "bg-muted/60" : "hover:bg-muted/40",
                      )}
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={(v) => toggle(key, v === true)}
                        className="shrink-0"
                      />
                      <label
                        htmlFor={inputId}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 overflow-hidden"
                      >
                        <Badge
                          variant="outline"
                          className="shrink-0 font-normal"
                        >
                          {typeLabel(a.type)}
                        </Badge>
                        <span
                          className="min-w-0 flex-1 truncate text-sm text-foreground"
                          title={a.title}
                        >
                          {a.title}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving || selected.length === 0}
          >
            {saving
              ? "Assigning…"
              : selected.length <= 1
                ? "Assign to section"
                : `Assign ${selected.length} to section`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
