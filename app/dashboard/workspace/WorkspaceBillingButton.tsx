'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function WorkspaceBillingButton({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/stripe/workspace-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || 'Checkout failed');
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={startCheckout} disabled={busy}>
        {busy ? 'Redirecting…' : 'Complete billing with Stripe'}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
