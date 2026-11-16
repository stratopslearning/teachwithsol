'use client';

import { apiFetch } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Gift, Hourglass, XCircle } from '@/components/icons';

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

export function GrantCompAccessButton({
  workspaceId,
  name,
  alreadyChurned,
  hasOpenPilot,
  hasLiveStripe,
}: {
  workspaceId: string;
  name: string;
  alreadyChurned?: boolean;
  /** Open finite or indefinite complimentary window. */
  hasOpenPilot?: boolean;
  /** Active Stripe subscription — revoke not allowed. */
  hasLiveStripe?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'30' | 'indefinite' | 'revoke' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (alreadyChurned || !mode) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === 'revoke'
          ? { action: 'revoke_comp_access' as const }
          : mode === 'indefinite'
            ? { action: 'grant_comp_access' as const, indefinite: true }
            : { action: 'grant_comp_access' as const, days: 30 };

      const res = await apiFetch(`/api/admin/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Request failed');
        return;
      }
      setMode(null);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  if (alreadyChurned) return null;

  const title =
    mode === 'revoke'
      ? 'Revoke pilot?'
      : mode === 'indefinite'
        ? 'Grant indefinite pilot?'
        : 'Grant 30-day access?';

  const description =
    mode === 'revoke' ? (
      <>
        Blocks teaching on <strong>{name}</strong> until they finish Stripe
        billing or you re-grant access. Courses stay; mutations are paywalled.
      </>
    ) : mode === 'indefinite' ? (
      <>
        Unlock <strong>{name}</strong> for teaching without Stripe until you
        revoke. You can revoke and re-grant any time.
      </>
    ) : (
      <>
        Unlock <strong>{name}</strong> for course creation without Stripe for
        30 days. Useful for demos and short pilots.
      </>
    );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-ink-muted hover:text-ink"
        title="Grant 30-day complimentary access"
        onClick={() => {
          setError(null);
          setMode('30');
        }}
      >
        <Gift className="h-4 w-4" />
        <span className="sr-only">Grant 30 days</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-ink-muted hover:text-ink"
        title="Grant indefinite pilot"
        onClick={() => {
          setError(null);
          setMode('indefinite');
        }}
      >
        <Hourglass className="h-4 w-4" />
        <span className="sr-only">Grant indefinite</span>
      </Button>
      {hasOpenPilot && !hasLiveStripe ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-ink-muted hover:text-destructive"
          title="Revoke pilot"
          onClick={() => {
            setError(null);
            setMode('revoke');
          }}
        >
          <XCircle className="h-4 w-4" />
          <span className="sr-only">Revoke pilot</span>
        </Button>
      ) : null}

      <AlertDialog
        open={mode != null}
        onOpenChange={(open) => {
          if (!open && !busy) setMode(null);
        }}
      >
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant={mode === 'revoke' ? 'destructive' : 'default'}
              onClick={() => void onConfirm()}
              disabled={busy}
            >
              {busy
                ? 'Working…'
                : mode === 'revoke'
                  ? 'Revoke pilot'
                  : mode === 'indefinite'
                    ? 'Grant indefinite'
                    : 'Grant 30 days'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
