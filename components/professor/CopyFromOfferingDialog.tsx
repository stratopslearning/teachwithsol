"use client";

import { apiFetch } from "@/lib/api/client";
import { useMemo, useState } from "react";
import { Loader2 } from "@/components/icons";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RolloverFinding } from "@/lib/authoring/rolloverChecks";
import type { OfferingCopySource } from "@/lib/authoring/copySources";

export function CopyFromOfferingDialog({
  targetOfferingId,
  targetCourseId,
  sources,
}: {
  targetOfferingId: string | null;
  targetCourseId: string;
  sources: OfferingCopySource[];
}) {
  const [open, setOpen] = useState(false);
  const [sourceOfferingId, setSourceOfferingId] = useState<string>("");
  const [findings, setFindings] = useState<RolloverFinding[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [copying, setCopying] = useState(false);

  const selected = useMemo(
    () => sources.find((s) => s.offeringId === sourceOfferingId) ?? null,
    [sourceOfferingId, sources],
  );

  async function loadChecks(courseId: string) {
    setLoadingChecks(true);
    setFindings([]);
    try {
      const res = await apiFetch(`/api/professor/authoring/courses/${courseId}/checks`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not load rollover checks");
        return;
      }
      setFindings(Array.isArray(data.findings) ? data.findings : []);
    } catch {
      toast.error("Could not load rollover checks");
    } finally {
      setLoadingChecks(false);
    }
  }

  async function onCopy() {
    if (!targetOfferingId || !sourceOfferingId) {
      toast.error("Pick a source offering");
      return;
    }
    setCopying(true);
    try {
      const res = await apiFetch(`/api/professor/offering/${targetOfferingId}/copy-from`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceOfferingId }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Copy failed");
        return;
      }
      toast.success(
        `Copied ${data.knowledgeLinksCopied ?? 0} knowledge link${
          (data.knowledgeLinksCopied ?? 0) === 1 ? "" : "s"
        }${data.outlineCloned ? " and outline" : ""}`,
      );
      setOpen(false);
    } catch {
      toast.error("Copy failed");
    } finally {
      setCopying(false);
    }
  }

  const disabled = !targetOfferingId || sources.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          Copy from prior offering
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy from a prior offering</DialogTitle>
          <DialogDescription>
            Clones knowledge links and outline structure into this course.
            Quizzes and discussions are not copied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="copy-source">Source offering</Label>
          <Select
            value={sourceOfferingId}
            onValueChange={(id) => {
              setSourceOfferingId(id);
              const src = sources.find((s) => s.offeringId === id);
              if (src) void loadChecks(src.courseId);
            }}
          >
            <SelectTrigger id="copy-source">
              <SelectValue placeholder="Select course / term" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.offeringId} value={s.offeringId}>
                  {s.courseTitle} · {s.termLabel}
                  {s.courseId === targetCourseId ? " (same course)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loadingChecks ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading rollover checks…
          </p>
        ) : findings.length > 0 ? (
          <div className="max-h-48 overflow-y-auto rounded-md border border-border p-3 text-sm">
            <p className="font-medium">Rollover checks on source</p>
            <ul className="mt-2 space-y-2">
              {findings.map((f, i) => (
                <li key={`${f.code}-${i}`}>
                  <span className="font-medium">{f.title}</span>
                  <span className="text-muted-foreground"> — {f.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : selected ? (
          <p className="text-sm text-muted-foreground">
            No rollover warnings on the source course.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={copying}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onCopy()}
            disabled={copying || !sourceOfferingId}
          >
            {copying ? (
              <>
                <Loader2 className="animate-spin" />
                Copying…
              </>
            ) : (
              "Confirm copy"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
