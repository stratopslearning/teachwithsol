"use client";

import { apiFetch } from "@/lib/api/client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Loader2, Upload } from "@/components/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { KnowledgeDocumentSummary } from "@/lib/knowledge";
import { cn } from "@/lib/utils";
import {
  MAX_UPLOAD_BYTES as MAX_BYTES,
  MAX_ZIP_UPLOAD_BYTES as MAX_ZIP_BYTES,
  MATERIAL_UPLOAD_ACCEPT as ACCEPTED,
} from "@/lib/uploadLimits";

function isZipFile(file: File) {
  const mime = (file.type || "").toLowerCase();
  return (
    /\.zip$/i.test(file.name) ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed"
  );
}

export type AttachableDoc = Pick<
  KnowledgeDocumentSummary,
  "id" | "title" | "status" | "sourceKind"
>;

export type CourseCorpusItem = {
  id: string;
  title: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  kind: "upload" | "library" | "book";
};

function corpusKindLabel(kind: CourseCorpusItem["kind"]): string {
  if (kind === "library") return "Library";
  if (kind === "book") return "Book";
  return "Upload";
}

export function AuthoringMaterialsPanel({
  courseId,
  materialsHref,
  attachableDocuments,
  corpusItems,
  focusedMaterialIds,
  onFocusedMaterialIdsChange,
  onAttached,
  onUploaded,
  disabled,
}: {
  courseId: string;
  materialsHref: string;
  attachableDocuments: AttachableDoc[];
  corpusItems: CourseCorpusItem[];
  focusedMaterialIds: string[];
  onFocusedMaterialIdsChange: (ids: string[]) => void;
  onAttached: (docId: string) => void;
  onUploaded: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const readyCorpus = corpusItems.filter((c) => c.status === "READY");
  const focusActive = focusedMaterialIds.length > 0;

  async function uploadFile(file: File) {
    const zip = isZipFile(file);
    if (zip && file.size > MAX_ZIP_BYTES) {
      toast.error("Zip must be 50 MB or smaller");
      return;
    }
    if (!zip && file.size > MAX_BYTES) {
      toast.error("File must be 50 MB or smaller");
      return;
    }
    const fd = new FormData();
    fd.set("courseId", courseId);
    fd.set("file", file);
    if (!zip) fd.set("title", file.name.replace(/\.[^.]+$/, ""));
    setUploading(true);
    try {
      const res = await apiFetch("/api/professor/materials", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
        redirect: "manual",
      });
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        toast.error("Session expired — refresh and sign in again");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          res.status === 401
            ? "Session expired — refresh and sign in again"
            : res.status === 413
              ? zip
                ? "Zip is too large (max 50 MB)"
                : "File is too large (max 50 MB)"
              : data.error || "Upload failed",
        );
        return;
      }
      if (data.zip) {
        const imported = Number(data.imported ?? 0);
        const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
        toast.success(
          skipped > 0
            ? `Imported ${imported} · ${skipped} skipped`
            : `Imported ${imported} from zip`,
          {
            description: "Select materials above before proposing.",
          },
        );
      } else {
        toast.success("Upload queued for indexing", {
          description: "Select materials above before proposing.",
        });
      }
      onUploaded();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function attachDoc(documentId: string) {
    setAttachingId(documentId);
    try {
      const res = await apiFetch("/api/professor/knowledge/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, documentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not attach document");
        return;
      }
      toast.success("Attached from library");
      onAttached(documentId);
    } catch {
      toast.error("Could not attach document");
    } finally {
      setAttachingId(null);
    }
  }

  function toggleFocus(id: string, on: boolean) {
    if (on) {
      onFocusedMaterialIdsChange([...focusedMaterialIds, id]);
    } else {
      onFocusedMaterialIdsChange(focusedMaterialIds.filter((x) => x !== id));
    }
  }

  const busy = disabled || uploading || Boolean(attachingId);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/70 p-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">
          Materials for authoring
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          By default SOL uses your whole Ready corpus when you prompt. Optionally
          check docs below to focus — or upload / attach more anytime.
        </p>
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          if (busy) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void uploadFile(file);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-center transition-colors",
          dragging
            ? "border-brand/50 bg-brand/10"
            : "border-border bg-muted/20",
          busy && "opacity-60",
        )}
      >
        <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-xs font-medium text-foreground">
            Drag & drop a file or zip
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            PDF, DOCX, TXT, MD · up to 50 MB · or zip pack up to 50 MB
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="animate-spin" />
                Uploading…
              </>
            ) : (
              "Choose file"
            )}
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={materialsHref}>Manage all</Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Course corpus
          </p>
          {focusActive ? (
            <button
              type="button"
              className="text-[11px] text-foreground underline-offset-2 hover:underline"
              onClick={() => onFocusedMaterialIdsChange([])}
            >
              Use all Ready ({readyCorpus.length})
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Agent uses all Ready
            </span>
          )}
        </div>
        {corpusItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            No course materials yet. Upload above or attach from the library.
          </p>
        ) : (
          <ul className="max-h-36 space-y-1 overflow-y-auto">
            {corpusItems.map((item) => {
              const ready = item.status === "READY";
              const checked = focusedMaterialIds.includes(item.id);
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/40 px-2.5 py-1.5"
                >
                  <Checkbox
                    checked={checked}
                    disabled={!ready || busy}
                    onCheckedChange={(v) => toggleFocus(item.id, v === true)}
                    aria-label={`Focus ${item.title}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {corpusKindLabel(item.kind)} ·{" "}
                    {item.status === "READY" ? "Ready" : item.status.toLowerCase()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {focusActive ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Focusing {focusedMaterialIds.length} doc
            {focusedMaterialIds.length === 1 ? "" : "s"} for propose / refine.
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          From workspace library
        </p>
        {attachableDocuments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            No Ready library docs left to attach. Upload above, or add docs in
            workspace Knowledge.
          </p>
        ) : (
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {attachableDocuments.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/40 px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {doc.title}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => void attachDoc(doc.id)}
                >
                  {attachingId === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Attach"
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
