'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type StudentRegradeRequestFormProps = {
  attemptId: string;
  existingOpenRequest?: { id: string; note: string; createdAt: string } | null;
};

export function StudentRegradeRequestForm({
  attemptId,
  existingOpenRequest,
}: StudentRegradeRequestFormProps) {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (existingOpenRequest) {
    return (
      <div className="mt-6 paper paper-shadow p-6 md:p-8">
        <span className="eyebrow text-ink-faint">Regrade request</span>
        <p className="text-sm text-ink-muted mt-2">
          Your instructor received your request on{' '}
          {new Date(existingOpenRequest.createdAt).toLocaleString()}. They will
          review and respond in the gradebook.
        </p>
        <p className="text-sm text-ink mt-3 border-l-2 border-rule pl-3">
          {existingOpenRequest.note}
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      toast.error('Please describe what you would like reviewed.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch('/api/student/regrade-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, note: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? 'Could not send regrade request');
        return;
      }
      toast.success('Regrade request sent to your instructor.');
      window.location.reload();
    } catch (err) {
      console.error(err);
      toast.error('Could not send regrade request');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-6 paper paper-shadow p-6 md:p-8">
      <span className="eyebrow text-ink-faint">Ask for a review</span>
      <p className="text-sm text-ink-muted mt-2">
        Think something was graded incorrectly? Send a note to your instructor.
        They see it in their attention queue and can override or re-grade.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="regrade-note">What should we look at?</Label>
          <Textarea
            id="regrade-note"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isSubmitting}
            maxLength={2000}
            placeholder="Point to the question and explain why you disagree with the score or feedback."
          />
        </div>
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Request regrade'}
        </Button>
      </form>
    </div>
  );
}
