'use client';

import { apiFetch } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { appPath } from '@/lib/basePath';
import { cn } from '@/lib/utils';

export function CreateCourseForm({
  workspaceId,
  disabled,
  disabledReason,
  defaultOpen = false,
  redirectToCourseHub = false,
}: {
  workspaceId: string;
  disabled?: boolean;
  disabledReason?: string;
  defaultOpen?: boolean;
  /** After create, navigate to the course hub instead of only refreshing. */
  redirectToCourseHub?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sectionName, setSectionName] = useState('Main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/professor/course/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          workspaceId,
          createDefaultSection: true,
          sectionName: sectionName.trim() || 'Main',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to create course');
        return;
      }
      setTitle('');
      setDescription('');
      setSectionName('Main');
      setOpen(false);
      if (redirectToCourseHub && data.course?.id) {
        router.push(appPath(`/dashboard/professor/courses/${data.course.id}`));
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {disabled && disabledReason ? (
          <p className="text-sm text-ink-muted">{disabledReason}</p>
        ) : (
          <p className="text-sm text-ink-muted">
            Start with a course and a first section — codes appear right away.
          </p>
        )}
        <Button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          New course
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'rounded-2xl border border-rule/80 bg-surface paper-shadow',
        'grid gap-4 p-5 sm:p-6',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">New course</p>
          <p className="mt-1 font-display text-xl text-ink tracking-tight">
            Create course &amp; section
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>

      {disabled && disabledReason ? (
        <p className="text-sm text-ink-muted">{disabledReason}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="course-title">Course title</Label>
          <Input
            id="course-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={disabled || busy}
            placeholder="e.g. Supply Chain Management"
            autoFocus
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="course-desc">Description (optional)</Label>
          <Textarea
            id="course-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={disabled || busy}
            rows={2}
            placeholder="A short note for your team"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="section-name">First section</Label>
          <Input
            id="section-name"
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            disabled={disabled || busy}
            placeholder="Main"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" disabled={disabled || busy}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
        <p className="text-xs text-ink-faint">
          You’ll be enrolled automatically and get faculty &amp; learner codes.
        </p>
      </div>
    </form>
  );
}
