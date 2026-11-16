'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function DisclosureRecordForm() {
  const [subjectUserId, setSubjectUserId] = useState('');
  const [subjectDescription, setSubjectDescription] = useState('');
  const [recipient, setRecipient] = useState('');
  const [purpose, setPurpose] = useState('');
  const [recordsReleased, setRecordsReleased] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    try {
      const res = await apiFetch('/api/admin/disclosure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectUserId: subjectUserId.trim() || undefined,
          subjectDescription,
          recipient,
          purpose,
          recordsReleased,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to record disclosure');
      }
      setStatus('ok');
      setSubjectUserId('');
      setSubjectDescription('');
      setRecipient('');
      setPurpose('');
      setRecordsReleased('');
    } catch (err) {
      setStatus('err');
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <form onSubmit={onSubmit} className="paper paper-shadow p-6 flex flex-col gap-4">
      <header>
        <span className="eyebrow text-ink-faint">FERPA</span>
        <h2 className="font-display text-lg text-ink mt-1">Record a disclosure</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Institution-directed release of education records. Writes an append-only
          audit entry (`ferpa.disclosure.record`).
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="disc-subject-desc">Subject / scope</Label>
          <Input
            id="disc-subject-desc"
            value={subjectDescription}
            onChange={(e) => setSubjectDescription(e.target.value)}
            required
            placeholder="e.g. Student Jane Doe, Fall 2025 section grades"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="disc-user-id">Subject user id (optional UUID)</Label>
          <Input
            id="disc-user-id"
            value={subjectUserId}
            onChange={(e) => setSubjectUserId(e.target.value)}
            placeholder="uuid"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="disc-recipient">Recipient</Label>
          <Input
            id="disc-recipient"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            required
            placeholder="Registrar / parent / counsel"
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="disc-purpose">Purpose</Label>
          <Input
            id="disc-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="disc-records">Records released</Label>
          <Textarea
            id="disc-records"
            value={recordsReleased}
            onChange={(e) => setRecordsReleased(e.target.value)}
            required
            rows={3}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Record disclosure'}
        </Button>
        {status === 'ok' ? (
          <span className="text-sm text-ink-muted">Recorded.</span>
        ) : null}
        {status === 'err' && error ? (
          <span className="text-sm text-destructive">{error}</span>
        ) : null}
      </div>
    </form>
  );
}
