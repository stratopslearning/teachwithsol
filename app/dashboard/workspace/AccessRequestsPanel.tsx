'use client';

import { apiFetch } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

export type AccessRequestRow = {
  id: string;
  email: string;
  name: string | null;
  claimedRole: string;
  createdAt: string | Date;
};

export function AccessRequestsPanel({
  workspaceId,
  initialRequests,
}: {
  workspaceId: string;
  initialRequests: AccessRequestRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(initialRequests);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function decide(
    requestId: string,
    decision: 'approved' | 'rejected' | 'blocked',
    role?: 'instructor' | 'admin',
  ) {
    setBusyId(requestId);
    setError(null);
    try {
      const res = await apiFetch(
          `/api/workspaces/${workspaceId}/access-requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            ...(decision === 'approved' ? { role: role ?? 'instructor' } : {}),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not update request');
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== requestId));
      startTransition(() => router.refresh());
    } catch {
      setError('Network error');
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="mt-3 text-xs text-ink-faint">No pending access requests.</p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule/60 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">
                {r.name?.trim() || r.email}
              </p>
              <p className="text-xs text-ink-faint">
                {r.email} · wants {r.claimedRole}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                disabled={pending || busyId === r.id}
                onClick={() => void decide(r.id, 'approved', 'instructor')}
              >
                Approve instructor
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || busyId === r.id}
                onClick={() => void decide(r.id, 'approved', 'admin')}
              >
                Approve admin
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || busyId === r.id}
                onClick={() => void decide(r.id, 'rejected')}
              >
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending || busyId === r.id}
                onClick={() => void decide(r.id, 'blocked')}
              >
                Block
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
