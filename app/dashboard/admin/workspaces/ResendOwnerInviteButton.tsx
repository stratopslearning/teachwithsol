'use client';

import { apiFetch } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Mail, RotateCcw } from '@/components/icons';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function ResendOwnerInviteButton({
  workspaceId,
  name,
  ownerEmail,
  claimStatus,
}: {
  workspaceId: string;
  name: string;
  ownerEmail: string | null;
  claimStatus: 'claimed' | 'pending' | 'expired' | 'none';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (claimStatus === 'claimed' || !ownerEmail) return null;

  async function onResend() {
    setBusy(true);
    setError(null);
    setClaimUrl(null);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${workspaceId}/owner-invite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: ownerEmail }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invite failed');
        return;
      }
      setClaimUrl(data.invite?.claimUrl ?? null);
      if (data.emailSkipped) {
        setError(
          'Invite rotated, but email is disabled (EMAIL_ENABLED). Copy the claim URL.',
        );
      } else if (data.emailError) {
        setError(
          `Invite rotated, but email failed: ${data.emailError}. Copy the claim URL.`,
        );
      } else if (data.emailSent === false) {
        setError(
          'Invite rotated, but email did not send. Copy the claim URL.',
        );
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!claimUrl) return;
    await navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-ink-muted hover:text-ink"
        title="Resend owner claim invite"
        onClick={() => {
          setError(null);
          setClaimUrl(null);
          setOpen(true);
        }}
      >
        <Mail className="h-4 w-4" />
        <span className="sr-only">Resend invite</span>
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resend owner invite?</AlertDialogTitle>
            <AlertDialogDescription>
              Rotate the claim link for <strong>{name}</strong> and send it to{' '}
              <strong>{ownerEmail}</strong>. Previous unclaimed links for this
              email are superseded. Copy the URL if email delivery fails.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {claimUrl ? (
            <div className="space-y-2 rounded-md border border-rule/70 bg-surface-sunken/40 p-3">
              <p className="text-xs text-ink-muted break-all">{claimUrl}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void onCopy()}>
                {copied ? 'Copied' : 'Copy claim URL'}
              </Button>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {claimUrl ? 'Done' : 'Cancel'}
            </AlertDialogCancel>
            {!claimUrl ? (
              <Button type="button" onClick={() => void onResend()} disabled={busy}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {busy ? 'Sending…' : 'Resend invite'}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
