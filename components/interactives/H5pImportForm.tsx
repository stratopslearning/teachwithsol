"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { FileArchive, Loader2, Package, Upload, X } from "@/components/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl, appPath } from "@/lib/basePath";
import { cn } from "@/lib/utils";

type SectionOpt = { id: string; title: string; courseId: string };

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function H5pImportForm({ sections }: { sections: SectionOpt[] }) {
  const router = useRouter();
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const courseId =
    sections.find((s) => s.id === sectionId)?.courseId ?? sections[0]?.courseId;

  function clearFile() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function acceptFile(next: File | null | undefined) {
    if (!next) return;
    const nameOk = /\.h5p$/i.test(next.name);
    const typeOk =
      next.type === "application/zip" ||
      next.type === "application/octet-stream" ||
      next.type === "";
    if (!nameOk && !typeOk) {
      setError("Choose a .h5p package");
      return;
    }
    setError(null);
    setFile(next);
    if (!title.trim()) {
      setTitle(next.name.replace(/\.h5p$/i, ""));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !courseId || !sectionId) {
      setError("Choose a section and .h5p file");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("courseId", courseId);
      form.set("title", title.trim() || file.name.replace(/\.h5p$/i, ""));
      form.set("sectionIds", sectionId);
      const res = await fetch(apiUrl("/api/professor/interactive/import"), {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      router.push(
        appPath("/dashboard/professor/assignments?type=INTERACTIVE"),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
        <p className="text-sm font-medium text-foreground">No active sections</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Join a section first, then import an H5P package for that roster.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href={appPath("/dashboard/professor/sections")}>
            Open sections
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
        Counts as complete when finished, not a quiz grade. To build one in
        SOL instead,{" "}
        <Link
          href={appPath("/dashboard/professor/interactive/new")}
          className="font-medium text-foreground underline underline-offset-2"
        >
          create an interactive
        </Link>
        .
      </div>

      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground">
            <Package className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-medium text-foreground">
              Package details
            </h2>
            <p className="text-xs text-muted-foreground">
              Export a .h5p from Canvas, Moodle, or Lumi, then assign it to one
              section.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to file name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="section">Section</Label>
            <select
              id="section"
              className="flex h-10 w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors hover:border-rule-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-medium text-foreground">.h5p package</h2>
          <p className="text-xs text-muted-foreground">
            Drop the exported file here, or browse from your computer.
          </p>
        </div>

        <input
          ref={fileRef}
          id={fileInputId}
          type="file"
          accept=".h5p,application/zip"
          className="sr-only"
          onChange={(e) => acceptFile(e.target.files?.[0])}
        />

        {file ? (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
              <FileArchive className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear selected file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor={fileInputId}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center transition-colors",
              dragging
                ? "border-foreground/40 bg-muted/60"
                : "border-border bg-background/50 hover:border-foreground/25 hover:bg-muted/40",
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
              <Upload className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm text-foreground">
              Drop a .h5p file here, or{" "}
              <span className="font-medium underline underline-offset-2">
                browse
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              Exported from Canvas, Moodle, or Lumi
            </span>
          </label>
        )}
      </section>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !file}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              Importing…
            </>
          ) : (
            <>
              <Package />
              Import H5P
            </>
          )}
        </Button>
        <Button asChild type="button" variant="ghost">
          <Link href={appPath("/dashboard/professor/assignments")}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
