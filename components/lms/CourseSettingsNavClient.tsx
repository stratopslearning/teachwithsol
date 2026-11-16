'use client';

import { apiFetch } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  COURSE_TOOL_IDS,
  COURSE_TOOL_LABELS,
  type CourseLmsNavigation,
  type CourseToolId,
  normalizeCourseNav,
} from '@/lib/lms/courseNav';

export function CourseSettingsNavClient({
  courseId,
  initialNav,
  syllabusMarkdown,
}: {
  courseId: string;
  initialNav: CourseLmsNavigation;
  syllabusMarkdown: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nav, setNav] = useState(() => normalizeCourseNav(initialNav));
  const [syllabus, setSyllabus] = useState(syllabusMarkdown ?? '');
  const [message, setMessage] = useState<string | null>(null);

  function move(id: CourseToolId, dir: -1 | 1) {
    setNav((prev) => {
      const tools = [...prev.tools];
      const idx = tools.findIndex((t) => t.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= tools.length) return prev;
      const tmp = tools[idx]!;
      tools[idx] = tools[next]!;
      tools[next] = tmp;
      return { tools };
    });
  }

  function toggleHidden(id: CourseToolId) {
    if (id === 'settings' || id === 'home') return;
    setNav((prev) => ({
      tools: prev.tools.map((t) =>
        t.id === id ? { ...t, hidden: !t.hidden } : t,
      ),
    }));
  }

  async function save() {
    setMessage(null);
    const res = await apiFetch(`/api/lms/courses/${courseId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        navigation: nav,
        syllabusMarkdown: syllabus,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(body.error ?? 'Save failed');
      return;
    }
    setMessage('Saved');
    startTransition(() => router.refresh());
  }

  async function seedDefaults() {
    setNav({
      tools: COURSE_TOOL_IDS.map((id) => ({ id, hidden: false })),
    });
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-medium text-ink">Navigation</h2>
          <Button variant="outline" size="sm" onClick={seedDefaults}>
            Reset order
          </Button>
        </div>
        <p className="mb-3 text-sm text-ink-muted">
          Hide or reorder tools for faculty and students in this course.
        </p>
        <ul className="space-y-2">
          {nav.tools.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-rule/60 px-3 py-2 text-sm"
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!t.hidden}
                  disabled={t.id === 'home' || t.id === 'settings'}
                  onChange={() => toggleHidden(t.id)}
                />
                {COURSE_TOOL_LABELS[t.id]}
              </label>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => move(t.id, -1)}
                >
                  Up
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => move(t.id, 1)}
                >
                  Down
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-base font-medium text-ink">Syllabus</h2>
        <textarea
          className="min-h-[160px] w-full rounded-md border border-rule bg-background px-3 py-2 text-sm"
          value={syllabus}
          onChange={(e) => setSyllabus(e.target.value)}
          placeholder="Course syllabus (markdown)"
        />
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={pending}>
          Save settings
        </Button>
        {message ? (
          <span className="text-sm text-ink-muted">{message}</span>
        ) : null}
      </div>
    </div>
  );
}
