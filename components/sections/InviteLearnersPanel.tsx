'use client';

import { useState } from 'react';

import { Check, Copy } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiUrl } from '@/lib/basePath';
import {
  downloadCsvTemplate,
  EMAIL_LIST_CSV_TEMPLATE,
} from '@/lib/csv/downloadTemplate';

type InviteResultRow = {
  email?: string;
  ok?: boolean;
  invited?: boolean;
  emailSent?: boolean;
  claimUrl?: string;
  error?: string;
};

function summarizeInviteResults(data: {
  enrolled?: number;
  invited?: number;
  failed?: number;
  results?: InviteResultRow[];
}): string {
  const results = Array.isArray(data.results) ? data.results : [];
  const enrolled =
    data.enrolled ?? results.filter((r) => r.ok && !r.invited).length;
  const invited =
    data.invited ?? results.filter((r) => r.ok && r.invited).length;
  const failed = data.failed ?? results.filter((r) => !r.ok).length;
  const emailed = results.filter((r) => r.emailSent).length;

  const parts: string[] = [];
  if (enrolled) parts.push(`Enrolled ${enrolled}`);
  if (invited) parts.push(`invited ${invited}`);
  if (failed) parts.push(`${failed} failed`);
  if (!parts.length) parts.push('No changes');
  parts.push(
    emailed
      ? `${emailed} emailed`
      : invited
        ? 'share claim links if email is off'
        : 'no emails sent',
  );
  return parts.join(' · ').replace(/^./, (c) => c.toUpperCase());
}

export function InviteLearnersPanel({ sectionId }: { sectionId: string }) {
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [claimRows, setClaimRows] = useState<
    Array<{ email: string; claimUrl: string; emailSent: boolean }>
  >([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  function captureClaimLinks(results: InviteResultRow[] | undefined) {
    const links = (results ?? [])
      .filter(
        (r): r is InviteResultRow & { email: string; claimUrl: string } =>
          Boolean(r.ok && r.claimUrl && r.email),
      )
      .map((r) => ({
        email: r.email,
        claimUrl: r.claimUrl,
        emailSent: Boolean(r.emailSent),
      }));
    setClaimRows(links);
  }

  async function onPasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSummary(null);
    setClaimRows([]);
    try {
      const res = await fetch(
        apiUrl(`/api/professor/section/${sectionId}/student-invites`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not send invites');
        return;
      }
      setSummary(summarizeInviteResults(data));
      captureClaimLinks(data.results as InviteResultRow[] | undefined);
      setEmails('');
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    setClaimRows([]);
    try {
      const csv = await file.text();
      const res = await fetch(
        apiUrl(`/api/professor/section/${sectionId}/roster-import`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Import failed');
        return;
      }
      setSummary(summarizeInviteResults(data));
      captureClaimLinks(data.results as InviteResultRow[] | undefined);
    } catch {
      setError('Could not read file');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1400);
    } catch {
      setError('Could not copy — select the link manually');
    }
  }

  return (
    <div className="grid gap-5">
      <p className="text-xs text-ink-muted leading-relaxed">
        Paste emails or upload a CSV (one email per row; optional{' '}
        <code className="font-mono text-[0.7rem]">email</code> header). We email
        a claim link to join this section; you can also copy links below if mail
        is off. Existing accounts enroll immediately on CSV import.
      </p>

      <form onSubmit={onPasteSubmit} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`learner-invite-${sectionId}`}>Paste emails</Label>
          <Textarea
            id={`learner-invite-${sectionId}`}
            rows={4}
            placeholder={'student1@university.edu\nstudent2@university.edu'}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            disabled={busy}
          />
        </div>
        <Button type="submit" disabled={busy || !emails.trim()}>
          {busy ? 'Sending…' : 'Invite from list'}
        </Button>
      </form>

      <div className="grid gap-2 border-t border-rule pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={`learner-csv-${sectionId}`}>Or upload CSV</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              downloadCsvTemplate(
                'learner_import_template.csv',
                EMAIL_LIST_CSV_TEMPLATE,
              )
            }
          >
            Download template
          </Button>
        </div>
        <input
          id={`learner-csv-${sectionId}`}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={onFileChange}
          className="text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-rule file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {summary ? <p className="text-sm text-brand">{summary}</p> : null}

      {claimRows.length > 0 ? (
        <div className="grid gap-2 rounded-lg border border-rule bg-surface-sunken/40 px-3 py-2">
          <p className="text-xs font-medium text-ink">Claim links</p>
          {claimRows.map((row) => (
            <div key={row.claimUrl} className="grid gap-1 border-t border-rule/60 pt-2 first:border-0 first:pt-0">
              <p className="text-xs text-ink-muted">
                {row.email}
                {row.emailSent ? ' · emailed' : ' · email not sent'}
              </p>
              <p className="break-all font-mono text-[0.7rem] text-ink-muted">
                {row.claimUrl}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => void copyLink(row.claimUrl)}
              >
                {copiedUrl === row.claimUrl ? (
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
          ))}
        </div>
      ) : null}
    </div>
  );
}
