'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function useCreate(courseId: string, path: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [extra, setExtra] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/lms/courses/${courseId}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Failed');
      return;
    }
    setTitle('');
    setExtra('');
    startTransition(() => router.refresh());
  }

  return { pending, title, setTitle, extra, setExtra, error, submit };
}

export function CreateAnnouncementForm({
  courseId,
  compact = false,
}: {
  courseId: string;
  compact?: boolean;
}) {
  const f = useCreate(courseId, 'announcements');
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Announcement title"
          value={f.title}
          onChange={(e) => f.setTitle(e.target.value)}
          className="h-10 w-44"
        />
        <Button
          className="h-10"
          disabled={f.pending || !f.title.trim()}
          onClick={() =>
            void f.submit({
              title: f.title,
              bodyMarkdown: f.extra || f.title,
              publish: true,
            })
          }
        >
          + Add announcement
        </Button>
        {f.error ? (
          <span className="text-sm text-destructive">{f.error}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="Title"
        value={f.title}
        onChange={(e) => f.setTitle(e.target.value)}
      />
      <Input
        placeholder="Body"
        value={f.extra}
        onChange={(e) => f.setExtra(e.target.value)}
        className="min-w-[240px] flex-1"
      />
      <Button
        disabled={f.pending || !f.title.trim()}
        onClick={() =>
          void f.submit({ title: f.title, bodyMarkdown: f.extra, publish: true })
        }
      >
        Post
      </Button>
      {f.error ? <span className="text-sm text-destructive">{f.error}</span> : null}
    </div>
  );
}

export function CreatePageForm({ courseId }: { courseId: string }) {
  const f = useCreate(courseId, 'pages');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="Page title"
        value={f.title}
        onChange={(e) => f.setTitle(e.target.value)}
      />
      <Button
        disabled={f.pending || !f.title.trim()}
        onClick={() =>
          void f.submit({
            title: f.title,
            slug: f.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
            markdown: '',
            published: false,
          })
        }
      >
        Add page
      </Button>
      {f.error ? <span className="text-sm text-destructive">{f.error}</span> : null}
    </div>
  );
}

export function CreateDiscussionForm({ courseId }: { courseId: string }) {
  const f = useCreate(courseId, 'discussions');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="Discussion title"
        value={f.title}
        onChange={(e) => f.setTitle(e.target.value)}
      />
      <Input
        placeholder="Prompt"
        value={f.extra}
        onChange={(e) => f.setExtra(e.target.value)}
        className="min-w-[240px] flex-1"
      />
      <Button
        disabled={f.pending || !f.title.trim()}
        onClick={() =>
          void f.submit({
            title: f.title,
            promptMarkdown: f.extra,
            published: true,
          })
        }
      >
        Create
      </Button>
      {f.error ? <span className="text-sm text-destructive">{f.error}</span> : null}
    </div>
  );
}

export function CreateOutcomeForm({ courseId }: { courseId: string }) {
  const f = useCreate(courseId, 'outcomes');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="Learning outcome"
        value={f.title}
        onChange={(e) => f.setTitle(e.target.value)}
        className="min-w-[240px] flex-1"
      />
      <Button
        disabled={f.pending || !f.title.trim()}
        onClick={() => void f.submit({ title: f.title, masteryPercent: 70 })}
      >
        Add outcome
      </Button>
      {f.error ? <span className="text-sm text-destructive">{f.error}</span> : null}
    </div>
  );
}

export function CreateRubricForm({ courseId }: { courseId: string }) {
  const f = useCreate(courseId, 'rubrics');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="Rubric title"
        value={f.title}
        onChange={(e) => f.setTitle(e.target.value)}
      />
      <Button
        disabled={f.pending || !f.title.trim()}
        onClick={() =>
          void f.submit({
            title: f.title,
            criteria: [
              { id: 'c1', description: 'Meets expectations', weight: 1 },
            ],
          })
        }
      >
        Add rubric
      </Button>
      {f.error ? <span className="text-sm text-destructive">{f.error}</span> : null}
    </div>
  );
}

export function CreateAssignmentGroupForm({
  courseId,
  compact = false,
}: {
  courseId: string;
  compact?: boolean;
}) {
  const f = useCreate(courseId, 'assignment-groups');
  const [weight, setWeight] = useState('20');
  const [dropLowest, setDropLowest] = useState('0');
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Group name"
          value={f.title}
          onChange={(e) => f.setTitle(e.target.value)}
          className="h-10 w-40"
        />
        <Button
          variant="outline"
          className="h-10"
          disabled={f.pending || !f.title.trim()}
          onClick={() =>
            void f.submit({
              name: f.title,
              weight: Number(weight) || 0,
              dropLowest: Number(dropLowest) || 0,
            })
          }
        >
          + Group
        </Button>
        {f.error ? (
          <span className="text-sm text-destructive">{f.error}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        placeholder="Group name (e.g. Quizzes)"
        value={f.title}
        onChange={(e) => f.setTitle(e.target.value)}
      />
      <Input
        type="number"
        placeholder="Weight %"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        className="w-24"
      />
      <Input
        type="number"
        placeholder="Drop lowest"
        value={dropLowest}
        onChange={(e) => setDropLowest(e.target.value)}
        className="w-28"
      />
      <Button
        disabled={f.pending || !f.title.trim()}
        onClick={() =>
          void f.submit({
            name: f.title,
            weight: Number(weight) || 0,
            dropLowest: Number(dropLowest) || 0,
          })
        }
      >
        Add group
      </Button>
      {f.error ? <span className="text-sm text-destructive">{f.error}</span> : null}
    </div>
  );
}
