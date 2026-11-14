'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ComponentType } from 'react';
import {
  GripVertical,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  TextCursorInput,
  Trash2,
} from '@/components/icons';

import { InteractivePreviewClient } from '@/components/interactives/InteractivePreviewClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InteractiveBody, InteractiveKind } from '@/app/db/schema';
import { apiUrl, appPath } from '@/lib/basePath';

type BuiltInKind = Exclude<InteractiveKind, 'H5P_PACKAGE'>;

const KIND_META: Record<
  BuiltInKind,
  { label: string; hint: string; icon: ComponentType<{ className?: string }> }
> = {
  FILL_BLANKS: {
    label: 'Fill blanks',
    hint: 'Learners type answers into {{blanks}}',
    icon: TextCursorInput,
  },
  DRAG_WORDS: {
    label: 'Drag words',
    hint: 'Drag tokens into gaps in a sentence',
    icon: GripVertical,
  },
  IMAGE_HOTSPOTS: {
    label: 'Hotspots',
    hint: 'Tap markers on an image for detail',
    icon: ImageIcon,
  },
  ACCORDION: {
    label: 'Accordion',
    hint: 'Expandable panels of course content',
    icon: Layers,
  },
};

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

function isBuiltIn(kind: InteractiveKind): kind is BuiltInKind {
  return kind !== 'H5P_PACKAGE';
}

export function InteractiveEditForm({
  interactive,
  cancelHref,
}: {
  interactive: {
    id: string;
    title: string;
    kind: InteractiveKind;
    body: InteractiveBody;
    courseId: string;
  };
  cancelHref?: string;
}) {
  const router = useRouter();
  const kind = interactive.kind;
  const body = interactive.body ?? {};
  const [title, setTitle] = useState(interactive.title);
  const [text, setText] = useState(body.text ?? '');
  const [sentence, setSentence] = useState(body.sentence ?? '');
  const [words, setWords] = useState((body.words ?? []).join(', '));
  const [distractors, setDistractors] = useState(
    (body.distractors ?? []).join(', '),
  );
  const [panels, setPanels] = useState<PanelDraft[]>(
    body.panels?.length
      ? body.panels.map((p) => ({
          id: p.id || newId(),
          title: p.title ?? '',
          body: p.body ?? '',
        }))
      : [{ id: newId(), title: '', body: '' }],
  );
  const [imageUrl, setImageUrl] = useState(body.imageUrl ?? '');
  const [hotspots, setHotspots] = useState<HotspotDraft[]>(
    body.hotspots?.length
      ? body.hotspots.map((h) => ({
          id: h.id || newId(),
          xPercent: h.xPercent ?? 50,
          yPercent: h.yPercent ?? 50,
          label: h.label ?? '',
          content: h.content ?? '',
        }))
      : [
          {
            id: newId(),
            xPercent: 50,
            yPercent: 50,
            label: '',
            content: '',
          },
        ],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const back =
    cancelHref ??
    appPath(`/dashboard/professor/courses/${interactive.courseId}/assignments`);

  const previewBody = useMemo((): InteractiveBody => {
    if (kind === 'FILL_BLANKS') return { text };
    if (kind === 'DRAG_WORDS') {
      return {
        sentence,
        words: words
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean),
        distractors: distractors
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean),
      };
    }
    if (kind === 'ACCORDION') {
      return {
        panels: panels
          .map((p) => ({
            id: p.id,
            title: p.title.trim(),
            body: p.body.trim(),
          }))
          .filter((p) => p.title || p.body),
      };
    }
    if (kind === 'IMAGE_HOTSPOTS') {
      return {
        imageUrl: imageUrl.trim(),
        hotspots: hotspots.map((h) => ({
          id: h.id,
          xPercent: Number(h.xPercent) || 0,
          yPercent: Number(h.yPercent) || 0,
          label: h.label.trim(),
          content: h.content.trim(),
        })),
      };
    }
    return body;
  }, [
    kind,
    text,
    sentence,
    words,
    distractors,
    panels,
    imageUrl,
    hotspots,
    body,
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Add a title');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let nextBody: InteractiveBody = {};
      if (kind === 'FILL_BLANKS') {
        if (!/\{\{[^}]+\}\}/.test(text)) {
          throw new Error('Add at least one {{answer}} blank in the text');
        }
        nextBody = { text };
      } else if (kind === 'DRAG_WORDS') {
        if (!/\{\{[^}]+\}\}/.test(sentence)) {
          throw new Error('Add at least one {{word}} blank in the sentence');
        }
        nextBody = {
          sentence,
          words: words
            .split(',')
            .map((w) => w.trim())
            .filter(Boolean),
          distractors: distractors
            .split(',')
            .map((w) => w.trim())
            .filter(Boolean),
        };
      } else if (kind === 'ACCORDION') {
        const cleaned = panels
          .map((p) => ({
            id: p.id || newId(),
            title: p.title.trim(),
            body: p.body.trim(),
          }))
          .filter((p) => p.title && p.body);
        if (cleaned.length === 0) {
          throw new Error('Add at least one accordion panel');
        }
        nextBody = { panels: cleaned };
      } else if (kind === 'IMAGE_HOTSPOTS') {
        if (!imageUrl.trim()) throw new Error('Add an image URL');
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
          throw new Error('Add at least one hotspot');
        }
        nextBody = { imageUrl: imageUrl.trim(), hotspots: cleaned };
      } else {
        // H5P package — title only
        nextBody = body;
      }

      const res = await fetch(
        apiUrl(`/api/professor/interactive/${interactive.id}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            body: nextBody,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  const meta = isBuiltIn(kind) ? KIND_META[kind] : null;

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl flex-col gap-5">
      <section className="rounded-2xl border border-border bg-card/40 p-5">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        {meta ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Type: <span className="font-medium text-foreground">{meta.label}</span>
            {' · '}
            {meta.hint}
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            H5P package — you can rename the activity; package content is
            managed via re-import.
          </p>
        )}
      </section>

      {isBuiltIn(kind) ? (
        <section className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-foreground">
              Edit content
            </h2>
            <p className="text-xs text-muted-foreground">
              Change anything the AI generated. Students see the saved version
              after you release.
            </p>
          </div>

          {kind === 'FILL_BLANKS' ? (
            <div className="space-y-2">
              <Label htmlFor="text">
                Passage (wrap answers in {'{{curly braces}}'})
              </Label>
              <Textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
              />
            </div>
          ) : null}

          {kind === 'DRAG_WORDS' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sentence">
                  Sentence (mark gaps with {'{{word}}'})
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
            </div>
          ) : null}

          {kind === 'ACCORDION' ? (
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
                        setPanels((prev) =>
                          prev.filter((p) => p.id !== panel.id),
                        )
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
                      rows={4}
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
                    { id: newId(), title: '', body: '' },
                  ])
                }
              >
                <Plus />
                Add panel
              </Button>
            </div>
          ) : null}

          {kind === 'IMAGE_HOTSPOTS' ? (
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
                      label: '',
                      content: '',
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
      ) : null}

      {isBuiltIn(kind) ? (
        <section className="rounded-2xl border border-dashed border-border bg-background/40 p-5">
          <p className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Live preview
          </p>
          <InteractivePreviewClient
            kind={kind}
            body={previewBody}
            title={title.trim() || interactive.title}
          />
        </section>
      ) : null}

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
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
        <Button asChild type="button" variant="ghost">
          <Link href={back}>Back to assignments</Link>
        </Button>
        {savedAt ? (
          <span className="text-xs text-muted-foreground">Saved {savedAt}</span>
        ) : null}
      </div>
    </form>
  );
}
