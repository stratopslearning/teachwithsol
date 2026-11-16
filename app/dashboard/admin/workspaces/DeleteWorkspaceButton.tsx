'use client';

import { apiFetch } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Trash2 } from '@/components/icons';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DeleteWorkspaceButton({
  workspaceId,
  name,
  slug,
  courseCount,
  childCount,
  isDefault,
  alreadyChurned,
}: {
  workspaceId: string;
  name: string;
  slug: string;
  courseCount: number;
  childCount: number;
  isDefault: boolean;
  alreadyChurned?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const softMode = courseCount > 0;
  const blocked = isDefault || childCount > 0 || Boolean(alreadyChurned);
  const slugMatches = typed.trim() === slug;

  async function onDelete() {
    if (!slugMatches || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmSlug: typed.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Delete failed');
        return;
      }
      setOpen(false);
      setTyped('');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTyped('');
          setError(null);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={isDefault || alreadyChurned}
          title={
            isDefault
              ? 'Default workspace cannot be deleted'
              : alreadyChurned
                ? 'Already soft-deleted'
                : softMode
                  ? 'Soft-delete workspace (has courses)'
                  : 'Delete workspace'
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {softMode ? 'Soft-delete' : 'Delete'} workspace “{name}”?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-ink-muted">
              {softMode ? (
                <p>
                  This workspace has{' '}
                  <strong className="text-ink">
                    {courseCount} course{courseCount === 1 ? '' : 's'}
                  </strong>
                  . Those courses and their sections will be{' '}
                  <strong className="text-ink">soft-deleted</strong>, licenses
                  canceled, and the workspace marked{' '}
                  <strong className="text-ink">churned</strong>. Data stays in
                  the DB for recovery/audit.
                </p>
              ) : (
                <p>
                  No active courses. This{' '}
                  <strong className="text-ink">permanently removes</strong> the
                  workspace, licenses, invites, and memberships. It cannot be
                  undone.
                </p>
              )}
              {isDefault ? (
                <p className="text-destructive">
                  The default workspace cannot be deleted.
                </p>
              ) : null}
              {alreadyChurned ? (
                <p className="text-destructive">
                  This workspace is already soft-deleted.
                </p>
              ) : null}
              {childCount > 0 ? (
                <p className="text-destructive">
                  {childCount} child workspace
                  {childCount === 1 ? '' : 's'} still reference this institution.
                  Delete or re-parent them first.
                </p>
              ) : null}
              {!blocked ? (
                <div className="grid gap-2 pt-1">
                  <Label htmlFor={`confirm-${workspaceId}`}>
                    Type <span className="font-mono text-ink">{slug}</span> to
                    confirm
                  </Label>
                  <Input
                    id={`confirm-${workspaceId}`}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    placeholder={slug}
                  />
                </div>
              ) : null}
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={blocked || !slugMatches || busy}
            onClick={onDelete}
          >
            {busy
              ? softMode
                ? 'Soft-deleting…'
                : 'Deleting…'
              : softMode
                ? 'Soft-delete workspace'
                : 'Delete workspace'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
