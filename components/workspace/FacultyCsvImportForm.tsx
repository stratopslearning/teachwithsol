'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  downloadCsvTemplate,
  EMAIL_LIST_CSV_TEMPLATE,
} from '@/lib/csv/downloadTemplate';

export function FacultyCsvImportForm({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const csv = await file.text();
      const res = await apiFetch('/api/workspace/faculty-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, csv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Import failed');
        return;
      }
      setSummary(
        `Invited ${data.invited ?? 0}, failed ${data.failed ?? 0}. Check results for claim links.`,
      );
    } catch {
      setError('Could not read file');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="mt-4 grid gap-2 border-t border-rule/60 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={`faculty-csv-${workspaceId}`}>
          Faculty list CSV (emails)
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            downloadCsvTemplate('faculty_import_template.csv', EMAIL_LIST_CSV_TEMPLATE)
          }
        >
          Download template
        </Button>
      </div>
      <p className="text-xs text-ink-faint">
        Each row should contain one email. Accounts must exist in SOL before
        invite.
      </p>
      <input
        id={`faculty-csv-${workspaceId}`}
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={onFileChange}
        className="text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-rule file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {summary ? <p className="text-sm text-ink-muted">{summary}</p> : null}
    </div>
  );
}
