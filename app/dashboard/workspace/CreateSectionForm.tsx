'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Plus } from '@/components/icons';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiUrl, appPath, withBasePath } from '@/lib/basePath';

export function CreateSectionForm({
  courseId,
  disabled,
}: {
  courseId: string;
  courseTitle?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || busy) return;
    const trimmed = name.trim() || 'Section';
    setBusy(true);
    setError(null);
    const toastId = toast.loading(`Creating “${trimmed}”…`);
    try {
      const res = await fetch(apiUrl('/api/professor/section'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          name: trimmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error || 'Failed to create section';
        setError(message);
        toast.error(message, { id: toastId });
        return;
      }
      const sectionId = data.section?.id ?? null;
      setCreatedId(sectionId);
      setName('');
      setOpen(false);
      toast.success(`“${trimmed}” is ready`, {
        id: toastId,
        description: 'Open the section for roster and email invites.',
      });
      if (sectionId) {
        router.push(
          withBasePath(
            `/dashboard/professor/courses/${courseId}/sections/${sectionId}`,
          ),
        );
      } else {
        router.refresh();
      }
    } catch {
      setError('Network error');
      toast.error('Network error — try again', { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || busy}
          loading={busy}
          onClick={() => setOpen(true)}
          className="text-ink-muted hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          Add section
        </Button>
        {createdId ? (
          <Button asChild variant="link" size="sm" className="h-auto px-0">
            <Link
              href={appPath(
                `/dashboard/professor/courses/${courseId}/sections/${createdId}`,
              )}
            >
              Open new section
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={busy}
      className="relative flex flex-col gap-2 rounded-xl border border-rule/70 bg-surface-sunken/40 p-3 sm:flex-row sm:items-center"
    >
      {busy ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl bg-surface/70 text-sm text-ink-muted backdrop-blur-[1px]"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating section…
        </div>
      ) : null}
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Section name (e.g. Fall 2026)"
        disabled={disabled || busy}
        className="bg-surface"
        autoFocus
        required
      />
      <div className="flex shrink-0 gap-2">
        <Button type="submit" size="sm" loading={busy} disabled={disabled}>
          {busy ? 'Creating…' : 'Add'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <p className="w-full text-xs text-destructive sm:basis-full">{error}</p>
      ) : null}
    </form>
  );
}
