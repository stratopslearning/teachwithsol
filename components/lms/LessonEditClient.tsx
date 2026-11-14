'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Plus, Trash2 } from '@/components/icons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiUrl } from '@/lib/basePath';
import type { InteractiveChapterBody } from '@/lib/lms/interactiveChapter';

function newId() {
  return crypto.randomUUID().slice(0, 8);
}

export function LessonEditClient({
  lesson,
}: {
  lesson: {
    id: string;
    title: string;
    markdown: string;
    chapter: InteractiveChapterBody | null;
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(lesson.title);
  const [markdown, setMarkdown] = useState(lesson.markdown);
  const [objectives, setObjectives] = useState(
    lesson.chapter?.learningObjectives?.join('\n') ?? '',
  );
  const [subtitle, setSubtitle] = useState(lesson.chapter?.subtitle ?? '');
  const [sections, setSections] = useState(
    lesson.chapter?.sections?.map((s) => ({
      id: s.id || newId(),
      title: s.title,
      markdown: s.markdown,
      checkBank: s.checkBank ?? [],
      subsections: s.subsections,
    })) ?? [],
  );
  const [wrapUp, setWrapUp] = useState(lesson.chapter?.wrapUpMarkdown ?? '');
  const [capstone, setCapstone] = useState(
    lesson.chapter?.capstoneMarkdown ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const isChapter = Boolean(lesson.chapter);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let payload: Record<string, unknown> = { title: title.trim() };
      if (isChapter) {
        const chapter: InteractiveChapterBody = {
          kind: 'interactive_chapter',
          subtitle: subtitle.trim() || undefined,
          learningObjectives: objectives
            .split('\n')
            .map((o) => o.trim())
            .filter(Boolean),
          sections: sections.map((s) => ({
            id: s.id,
            title: s.title.trim(),
            markdown: s.markdown,
            checkBank: s.checkBank,
            subsections: s.subsections,
          })),
          wrapUpMarkdown: wrapUp.trim() || undefined,
          capstoneMarkdown: capstone.trim() || undefined,
        };
        if (chapter.sections.length === 0) {
          throw new Error('Add at least one section');
        }
        if (chapter.sections.some((s) => !s.title.trim() || !s.markdown.trim())) {
          throw new Error('Each section needs a title and body');
        }
        payload = { ...payload, chapter };
      } else {
        if (!markdown.trim()) throw new Error('Lesson markdown is required');
        payload = { ...payload, markdown, chapter: null };
      }

      const res = await fetch(apiUrl(`/api/professor/lesson/${lesson.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
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

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-rule/80 bg-surface p-4 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="lesson-title">Title</Label>
          <Input
            id="lesson-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {isChapter ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="lesson-subtitle">Subtitle</Label>
              <Input
                id="lesson-subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lesson-objectives">
                Learning objectives (one per line)
              </Label>
              <Textarea
                id="lesson-objectives"
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                rows={4}
              />
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="lesson-md">Markdown</Label>
            <Textarea
              id="lesson-md"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={16}
              className="font-mono text-sm"
            />
          </div>
        )}
      </div>

      {isChapter
        ? sections.map((section, index) => (
            <div
              key={section.id}
              className="rounded-xl border border-rule/80 bg-surface p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.12em] text-ink-muted">
                  Section {index + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={sections.length <= 1}
                  onClick={() =>
                    setSections((prev) =>
                      prev.filter((s) => s.id !== section.id),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={section.title}
                onChange={(e) =>
                  setSections((prev) =>
                    prev.map((s) =>
                      s.id === section.id
                        ? { ...s, title: e.target.value }
                        : s,
                    ),
                  )
                }
                placeholder="Section title"
              />
              <Textarea
                value={section.markdown}
                onChange={(e) =>
                  setSections((prev) =>
                    prev.map((s) =>
                      s.id === section.id
                        ? { ...s, markdown: e.target.value }
                        : s,
                    ),
                  )
                }
                rows={10}
                className="font-mono text-sm"
                placeholder="Section markdown"
              />
              <p className="text-xs text-ink-muted">
                Practice bank: {section.checkBank.length} question
                {section.checkBank.length === 1 ? '' : 's'} (kept as-is when
                you save reading content).
              </p>
            </div>
          ))
        : null}

      {isChapter ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setSections((prev) => [
                ...prev,
                {
                  id: newId(),
                  title: '',
                  markdown: '',
                  checkBank: [],
                  subsections: undefined,
                },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add section
          </Button>
          <div className="rounded-xl border border-rule/80 bg-surface p-4 space-y-3">
            <div className="space-y-2">
              <Label>Wrap-up</Label>
              <Textarea
                value={wrapUp}
                onChange={(e) => setWrapUp(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Capstone</Label>
              <Textarea
                value={capstone}
                onChange={(e) => setCapstone(e.target.value)}
                rows={4}
              />
            </div>
          </div>
        </>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save lesson'
          )}
        </Button>
        {savedAt ? (
          <span className="text-xs text-ink-muted">Saved {savedAt}</span>
        ) : null}
      </div>
    </div>
  );
}
