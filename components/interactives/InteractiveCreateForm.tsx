"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ComponentType } from "react";
import {
  GripVertical,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  TextCursorInput,
  Trash2,
  Type,
} from "@/components/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl, appPath } from "@/lib/basePath";
import type { InteractiveKind } from "@/app/db/schema";
import { cn } from "@/lib/utils";

type BuiltInKind = Exclude<InteractiveKind, "H5P_PACKAGE">;

const KINDS: Array<{
  id: BuiltInKind;
  label: string;
  hint: string;
  // Animated or static icon from @/components/icons
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;
}> = [
  {
    id: "FILL_BLANKS",
    label: "Fill blanks",
    hint: "Learners type answers into {{blanks}}",
    icon: TextCursorInput,
  },
  {
    id: "DRAG_WORDS",
    label: "Drag words",
    hint: "Drag tokens into gaps in a sentence",
    icon: GripVertical,
  },
  {
    id: "IMAGE_HOTSPOTS",
    label: "Hotspots",
    hint: "Tap markers on an image for detail",
    icon: ImageIcon,
  },
  {
    id: "ACCORDION",
    label: "Accordion",
    hint: "Expandable panels of course content",
    icon: Layers,
  },
];

type SectionOpt = { id: string; title: string; courseId: string };

type PanelDraft = { id: string; title: string; body: string };
type HotspotDraft = {
  id: string;
  xPercent: number;
  yPercent: number;
  label: string;
  content: string;
};

function newId() {
  return crypto.randomUUID().slice(0, 8);
}

function BlankPreview({ source }: { source: string }) {
  const parts = useMemo(() => {
    const nodes: Array<{ key: string; kind: "text" | "blank"; value: string }> =
      [];
    const re = /\{\{([^}]+)\}\}/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let i = 0;
    while ((match = re.exec(source)) !== null) {
      if (match.index > last) {
        nodes.push({
          key: `t-${i}`,
          kind: "text",
          value: source.slice(last, match.index),
        });
      }
      nodes.push({
        key: `b-${i}`,
        kind: "blank",
        value: match[1]?.trim() || "…",
      });
      last = match.index + match[0].length;
      i += 1;
    }
    if (last < source.length) {
      nodes.push({
        key: `t-end`,
        kind: "text",
        value: source.slice(last),
      });
    }
    return nodes;
  }, [source]);

  if (!source.trim()) {
    return (
      <p className="text-xs text-muted-foreground">
        Add text with {"{{answer}}"} markers to preview blanks.
      </p>
    );
  }

  return (
    <p className="text-sm leading-7 text-foreground">
      {parts.map((part) =>
        part.kind === "text" ? (
          <span key={part.key}>{part.value}</span>
        ) : (
          <span
            key={part.key}
            className="mx-0.5 inline-flex min-w-[4.5rem] items-center justify-center rounded-md border border-dashed border-brand/40 bg-brand/10 px-2 py-0.5 text-xs font-medium text-foreground"
            title={part.value}
          >
            {part.value}
          </span>
        ),
      )}
    </p>
  );
}

export function InteractiveCreateForm({
  sections,
}: {
  sections: SectionOpt[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<BuiltInKind>("FILL_BLANKS");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [text, setText] = useState(
    "Photosynthesis converts {{light}} energy into chemical energy.",
  );
  const [sentence, setSentence] = useState(
    "The {{mitochondria}} is the powerhouse of the cell.",
  );
  const [words, setWords] = useState("mitochondria");
  const [distractors, setDistractors] = useState("nucleus, ribosome");
  const [panels, setPanels] = useState<PanelDraft[]>([
    {
      id: "1",
      title: "Key idea",
      body: "Explain the concept in your own words.",
    },
  ]);
  const [imageUrl, setImageUrl] = useState("");
  const [hotspots, setHotspots] = useState<HotspotDraft[]>([
    {
      id: "1",
      xPercent: 40,
      yPercent: 35,
      label: "Label",
      content: "Detail students see when they tap this spot.",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const courseId =
    sections.find((s) => s.id === sectionId)?.courseId ?? sections[0]?.courseId;
  const selectedKind = KINDS.find((k) => k.id === kind) ?? KINDS[0];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !sectionId) {
      setError("Select a section");
      return;
    }
    if (!title.trim()) {
      setError("Add a title");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let body: Record<string, unknown> = {};
      if (kind === "FILL_BLANKS") {
        if (!/\{\{[^}]+\}\}/.test(text)) {
          throw new Error('Add at least one {{answer}} blank in the text');
        }
        body = { text };
      } else if (kind === "DRAG_WORDS") {
        if (!/\{\{[^}]+\}\}/.test(sentence)) {
          throw new Error("Add at least one {{word}} blank in the sentence");
        }
        body = {
          sentence,
          words: words
            .split(",")
            .map((w) => w.trim())
            .filter(Boolean),
          distractors: distractors
            .split(",")
            .map((w) => w.trim())
            .filter(Boolean),
        };
      } else if (kind === "ACCORDION") {
        const cleaned = panels
          .map((p) => ({
            id: p.id || newId(),
            title: p.title.trim(),
            body: p.body.trim(),
          }))
          .filter((p) => p.title && p.body);
        if (cleaned.length === 0) {
          throw new Error("Add at least one accordion panel");
        }
        body = { panels: cleaned };
      } else if (kind === "IMAGE_HOTSPOTS") {
        if (!imageUrl.trim()) throw new Error("Add an image URL");
        const cleaned = hotspots
          .map((h) => ({
            id: h.id || newId(),
            xPercent: Number(h.xPercent) || 0,
            yPercent: Number(h.yPercent) || 0,
            label: h.label.trim(),
            content: h.content.trim(),
          }))
          .filter((h) => h.label && h.content);
        if (cleaned.length === 0) {
          throw new Error("Add at least one hotspot");
        }
        body = { imageUrl: imageUrl.trim(), hotspots: cleaned };
      }

      const res = await fetch(apiUrl("/api/professor/interactive"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          title: title.trim(),
          kind,
          body,
          sectionIds: [sectionId],
          isActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      router.push(
        appPath(
          `/dashboard/professor/interactive/${data.interactive.id}/edit`,
        ),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
        <p className="text-sm font-medium text-foreground">No active sections</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Join a section first, then create interactives for that roster.
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
    <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
        Counts as complete when finished, not a quiz grade. Already have a
        package?{" "}
        <Link
          href={appPath("/dashboard/professor/interactive/import")}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Import H5P
        </Link>
        .
      </div>

      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Photosynthesis blanks"
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
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
        <div className="mb-3">
          <h2 className="text-sm font-medium text-foreground">Activity type</h2>
          <p className="text-xs text-muted-foreground">
            Choose how students interact with the content.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const selected = kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                  selected
                    ? "border-foreground/25 bg-muted/60"
                    : "border-border bg-background/40 hover:border-foreground/20 hover:bg-muted/40",
                )}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {k.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {k.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-medium text-foreground">
            {selectedKind.label} content
          </h2>
          <p className="text-xs text-muted-foreground">{selectedKind.hint}</p>
        </div>

        {kind === "FILL_BLANKS" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="text">
                Passage (wrap answers in {"{{curly braces}}"})
              </Label>
              <Textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
              />
            </div>
            <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-3">
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </p>
              <BlankPreview source={text} />
            </div>
          </div>
        ) : null}

        {kind === "DRAG_WORDS" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sentence">
                Sentence (mark gaps with {"{{word}}"})
              </Label>
              <Textarea
                id="sentence"
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="words">Correct words</Label>
                <Input
                  id="words"
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  placeholder="comma-separated"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="distractors">Distractors</Label>
                <Input
                  id="distractors"
                  value={distractors}
                  onChange={(e) => setDistractors(e.target.value)}
                  placeholder="optional extras"
                />
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-3">
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Preview
              </p>
              <BlankPreview source={sentence} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...words.split(","), ...distractors.split(",")]
                  .map((w) => w.trim())
                  .filter(Boolean)
                  .map((w) => (
                    <span
                      key={w}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
                    >
                      {w}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        ) : null}

        {kind === "ACCORDION" ? (
          <div className="space-y-3">
            {panels.map((panel, index) => (
              <div
                key={panel.id}
                className="rounded-xl border border-border bg-background/50 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Panel {index + 1}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPanels((prev) => prev.filter((p) => p.id !== panel.id))
                    }
                    disabled={panels.length <= 1}
                    aria-label={`Remove panel ${index + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="space-y-3">
                  <Input
                    value={panel.title}
                    onChange={(e) =>
                      setPanels((prev) =>
                        prev.map((p) =>
                          p.id === panel.id
                            ? { ...p, title: e.target.value }
                            : p,
                        ),
                      )
                    }
                    placeholder="Panel title"
                  />
                  <Textarea
                    value={panel.body}
                    onChange={(e) =>
                      setPanels((prev) =>
                        prev.map((p) =>
                          p.id === panel.id
                            ? { ...p, body: e.target.value }
                            : p,
                        ),
                      )
                    }
                    rows={3}
                    placeholder="Panel body"
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setPanels((prev) => [
                  ...prev,
                  { id: newId(), title: "", body: "" },
                ])
              }
            >
              <Plus />
              Add panel
            </Button>
          </div>
        ) : null}

        {kind === "IMAGE_HOTSPOTS" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                type="url"
              />
            </div>
            {hotspots.map((spot, index) => (
              <div
                key={spot.id}
                className="rounded-xl border border-border bg-background/50 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Hotspot {index + 1}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setHotspots((prev) =>
                        prev.filter((h) => h.id !== spot.id),
                      )
                    }
                    disabled={hotspots.length <= 1}
                    aria-label={`Remove hotspot ${index + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input
                      value={spot.label}
                      onChange={(e) =>
                        setHotspots((prev) =>
                          prev.map((h) =>
                            h.id === spot.id
                              ? { ...h, label: e.target.value }
                              : h,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Content</Label>
                    <Textarea
                      value={spot.content}
                      onChange={(e) =>
                        setHotspots((prev) =>
                          prev.map((h) =>
                            h.id === spot.id
                              ? { ...h, content: e.target.value }
                              : h,
                          ),
                        )
                      }
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>X %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={spot.xPercent}
                      onChange={(e) =>
                        setHotspots((prev) =>
                          prev.map((h) =>
                            h.id === spot.id
                              ? {
                                  ...h,
                                  xPercent: Number(e.target.value) || 0,
                                }
                              : h,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Y %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={spot.yPercent}
                      onChange={(e) =>
                        setHotspots((prev) =>
                          prev.map((h) =>
                            h.id === spot.id
                              ? {
                                  ...h,
                                  yPercent: Number(e.target.value) || 0,
                                }
                              : h,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setHotspots((prev) => [
                  ...prev,
                  {
                    id: newId(),
                    xPercent: 50,
                    yPercent: 50,
                    label: "",
                    content: "",
                  },
                ])
              }
            >
              <Plus />
              Add hotspot
            </Button>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <Type />
              Create interactive
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
