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

type StaffInviteRole = 'co_instructor' | 'ta' | 'grader';

function roleLabel(role: StaffInviteRole): string {
  if (role === 'co_instructor') return 'Instructor';
  if (role === 'ta') return 'TA';
  return 'Grader';
}

export function SectionStaffInviteForm({ sectionId }: { sectionId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffInviteRole>('co_instructor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    setClaimUrl(null);
    setCopied(false);
    const invitedEmail = email.trim();
    try {
      const res = await apiFetch(`/api/professor/section/${sectionId}/staff`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: invitedEmail, role }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not add staff');
        return;
      }
      const label = roleLabel(role);
      if (data.invited && data.claimUrl) {
        setClaimUrl(data.claimUrl as string);
        if (data.emailSent) {
          setSuccess(`Invite emailed to ${invitedEmail} as ${label}.`);
        } else if (data.emailSkipped) {
          setSuccess(
            `Invite created for ${invitedEmail} as ${label}. Share the link below.`,
          );
        } else {
          setSuccess(
            `Email not sent for ${invitedEmail}. Share the claim link below.`,
          );
        }
      } else {
        setSuccess(`Added ${invitedEmail} as ${label}.`);
      }
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
    <form onSubmit={onSubmit} className="grid gap-3">
      <p className="text-xs text-ink-muted leading-relaxed">
        Invite an instructor, TA, or grader by email. Instructors can teach and
        publish; TAs and graders grade from the TA desk without publishing or
        editing rubrics. You can also share the faculty enrolment code.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={`staff-email-${sectionId}`}>Colleague email</Label>
        <Input
          id={`staff-email-${sectionId}`}
          type="email"
          required
          autoComplete="email"
          placeholder="colleague@university.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-[8rem] flex-1 gap-1.5">
          <Label>Role</Label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as StaffInviteRole)}
            disabled={busy}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="co_instructor">Instructor</SelectItem>
              <SelectItem value="ta">Teaching assistant</SelectItem>
              <SelectItem value="grader">Grader</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy ? 'Adding…' : 'Add staff'}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-brand">{success}</p> : null}
      {claimUrl ? (
        <div className="rounded-lg border border-rule bg-surface-sunken/40 px-3 py-2">
          <p className="break-all font-mono text-[0.7rem] text-ink-muted">
            {claimUrl}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void copyLink()}
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
    </form>
  );
}
