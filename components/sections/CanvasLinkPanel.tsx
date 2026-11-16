'use client';

import { apiFetch } from '@/lib/api/client';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LinkState = {
  enabled: boolean;
  link: {
    id: string;
    canvasCourseId: string;
    canvasSectionId: string | null;
    hasAgs: boolean;
    hasNrps: boolean;
    updatedAt?: string;
  } | null;
};

export function CanvasLinkPanel({ sectionId }: { sectionId: string }) {
  const [state, setState] = useState<LinkState | null>(null);
  const [courseId, setCourseId] = useState('');
  const [sectionCanvasId, setSectionCanvasId] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/professor/section/${sectionId}/canvas`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as LinkState;
        if (cancelled) return;
        setState(data);
        if (data.link) {
          setCourseId(data.link.canvasCourseId);
          setSectionCanvasId(data.link.canvasSectionId ?? '');
        }
      } catch {
        // Panel stays hidden on hard failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sectionId]);

  if (!state?.enabled) return null;

  const save = () => {
    startTransition(async () => {
      try {
        const res = await apiFetch(`/api/professor/section/${sectionId}/canvas`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              canvasCourseId: courseId,
              canvasSectionId: sectionCanvasId || null,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(
            typeof data.error === 'string'
              ? data.error
              : 'Could not link Canvas course',
          );
          return;
        }
        setState((prev) =>
          prev
            ? {
                ...prev,
                link: data.link,
              }
            : prev,
        );
        toast.success('Linked to Canvas. Launch SOL from Canvas to activate grade passback.');
      } catch {
        toast.error("We couldn't reach Canvas link settings.");
      }
    });
  };

  const unlink = () => {
    startTransition(async () => {
      const res = await apiFetch(`/api/professor/section/${sectionId}/canvas`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        toast.error('Could not unlink');
        return;
      }
      setState((prev) => (prev ? { ...prev, link: null } : prev));
      setCourseId('');
      setSectionCanvasId('');
      toast.success('Unlinked from Canvas');
    });
  };

  const syncRoster = () => {
    startTransition(async () => {
      const res = await apiFetch(`/api/professor/section/${sectionId}/canvas`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync-roster' }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : 'Roster sync failed. Launch from Canvas once first.',
        );
        return;
      }
      toast.success(
        `Roster synced: ${data.result?.studentsActive ?? 0} students, ${data.result?.professorsActive ?? 0} faculty`,
      );
    });
  };

  return (
    <section className="mt-12 rounded-lg border border-border/60 p-6">
      <h2 className="text-lg font-medium tracking-tight">Canvas</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Link this SOL section to a Canvas course. Enrollment codes still work.
        After you launch SOL from Canvas once, roster sync and grade passback
        activate for this link.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="canvas-course-id">Canvas course ID</Label>
          <Input
            id="canvas-course-id"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            placeholder="e.g. 12345"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="canvas-section-id">Canvas section ID (optional)</Label>
          <Input
            id="canvas-section-id"
            value={sectionCanvasId}
            onChange={(e) => setSectionCanvasId(e.target.value)}
            placeholder="Optional"
            autoComplete="off"
          />
        </div>
      </div>

      {state.link ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Linked
          {state.link.hasAgs ? ' · grade passback ready' : ' · awaiting Canvas launch for AGS'}
          {state.link.hasNrps ? ' · roster ready' : ''}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={pending || !courseId.trim()}>
          {state.link ? 'Update link' : 'Link to Canvas'}
        </Button>
        {state.link ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={syncRoster}
              disabled={pending}
            >
              Sync roster
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={unlink}
              disabled={pending}
            >
              Unlink
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}
