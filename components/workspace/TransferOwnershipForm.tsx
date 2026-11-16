'use client';

import { apiFetch } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { confirmAction } from '@/components/feedback/ConfirmDialog';

export type OwnershipCandidate = { userId: string; label: string };

/**
 * Transfer workspace ownership (POST /api/workspace/transfer-ownership).
 * Only render for users holding the `ownership.transfer` permission.
 * The server guarantees the workspace always keeps >= 1 owner; the former
 * owner is demoted to admin so they are not locked out.
 */
export function TransferOwnershipForm({
  workspaceId,
  candidates,
}: {
  workspaceId: string;
  candidates: OwnershipCandidate[];
}) {
  const router = useRouter();
  const [toUserId, setToUserId] = useState('');
  const [busy, setBusy] = useState(false);

  async function onTransfer() {
    const target = candidates.find((c) => c.userId === toUserId);
    if (!target) return;
    if (
      !await confirmAction(
        `Transfer ownership to ${target.label}? You will become an admin.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/api/workspace/transfer-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, toUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Transfer failed');
        return;
      }
      toast.success('Ownership transferred');
      router.refresh();
    } catch {
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 border-t border-rule/60 pt-4">
      <Label htmlFor={`transfer-owner-${workspaceId}`}>Transfer ownership</Label>
      <p className="text-xs text-ink-faint">
        The new owner receives full control. A workspace always keeps at least
        one owner.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`transfer-owner-${workspaceId}`}
          className="h-9 rounded-md border border-rule bg-surface px-2 text-sm"
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          disabled={busy || candidates.length === 0}
        >
          <option value="">Select a member…</option>
          {candidates.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !toUserId}
          onClick={onTransfer}
        >
          {busy ? 'Transferring…' : 'Transfer'}
        </Button>
      </div>
    </div>
  );
}
