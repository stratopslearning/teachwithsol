'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
import { Check, Copy } from '@/components/icons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function InviteFacultyForm({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'instructor' | 'admin'>('instructor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSkipped, setEmailSkipped] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setClaimUrl(null);
    setEmailSent(false);
    setEmailSkipped(false);
    setCopied(false);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invite failed');
        return;
      }
      setClaimUrl(data.invite?.claimUrl ?? null);
      setEmailSent(Boolean(data.emailSent));
      setEmailSkipped(Boolean(data.emailSkipped));
      setEmail('');
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!claimUrl) return;
    try {
      await navigator.clipboard.writeText(claimUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setError('Could not copy — select the link manually');
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="faculty-email">Email</Label>
          <Input
            id="faculty-email"
            type="email"
            autoComplete="email"
            required
            placeholder="colleague@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as 'instructor' | 'admin')}
              disabled={busy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instructor">Instructor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy || !email.trim()}>
            {busy ? '…' : 'Invite'}
          </Button>
        </div>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {claimUrl ? (
        <div className="rounded-xl border border-brand/25 bg-brand-soft/40 px-3.5 py-3 text-sm">
          <p className="font-medium text-ink">
            {emailSent
              ? 'Invite email sent'
              : emailSkipped
                ? 'Claim link ready'
                : 'Email not sent — share this link'}
          </p>
          <p className="mt-1 text-xs text-ink-muted leading-relaxed">
            {emailSent
              ? 'We emailed the claim link. You can still copy it below if they need a reminder.'
              : 'Send only to the invited address. They join this workspace — not as a platform admin.'}
          </p>
          <p className="mt-2 break-all font-mono text-[0.7rem] text-ink-muted">
            {claimUrl}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={copyLink}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
