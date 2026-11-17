'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
import { Check } from '@/components/icons';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/feedback/ConfirmDialog';
import { useRouter } from 'next/navigation';

export function ResolveRegradeRequestButton({
  requestId,
}: {
  requestId: string;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleResolve() {
    if (
      !await confirmAction(
        'Mark this regrade request resolved? The student will no longer see it as open.',
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/professor/regrade-requests/${requestId}/resolve`,
        { method: 'POST' },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to resolve request');
        return;
      }
      toast.success('Regrade request closed.');
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error('Failed to resolve request');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleResolve}
      disabled={isLoading}
    >
      <Check className="mr-1.5 h-3.5 w-3.5" />
      {isLoading ? 'Closing…' : 'Resolve'}
    </Button>
  );
}
