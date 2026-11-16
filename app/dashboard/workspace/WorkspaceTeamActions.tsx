'use client';

import { apiFetch } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

export function RemoveMemberButton({
  workspaceId,
  membershipId,
  label,
}: {
  workspaceId: string;
  membershipId: string;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onRemove() {
    if (!confirm(`Remove ${label} from this workspace?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/members/${membershipId}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not remove member');
        return;
      }
      toast.success('Member removed');
      router.refresh();
    } catch {
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onRemove}
    >
      Remove
    </Button>
  );
}

export function RevokeInviteButton({
  workspaceId,
  inviteId,
  email,
}: {
  workspaceId: string;
  inviteId: string;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onRevoke() {
    if (!confirm(`Revoke invite for ${email}?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/invites/${inviteId}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not revoke invite');
        return;
      }
      toast.success('Invite revoked');
      router.refresh();
    } catch {
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onRevoke}
    >
      Revoke
    </Button>
  );
}
