'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
import { RefreshCw } from '@/components/icons';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type RegradeAllButtonProps = {
  /** How many attempts are currently in the queue, for the confirm copy. */
  count: number;
};

/**
 * One-click trigger that re-grades every attempt currently in the
 * professor's attention queue. Hits a single bulk endpoint to avoid the
 * per-attempt rate limit, and the server schedules the actual work after
 * the response so the toast lands instantly.
 */
export function RegradeAllButton({ count }: RegradeAllButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const disabled = count === 0 || isLoading;

  async function handleClick() {
    if (count === 0) return;
    const confirmed = window.confirm(
      `Re-grade all ${count} attempt${count === 1 ? '' : 's'} in your attention queue?\n\nThis runs in the background. You can keep using the app. Refresh the page in a minute to see progress.`,
    );
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = await apiFetch('/api/professor/attention/regrade-all',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? 'Bulk re-grade failed');
        return;
      }

      if ((data?.scheduled ?? 0) === 0) {
        toast.info('Nothing to re-grade.');
      } else {
        toast.success(
          `Re-grading ${data.scheduled} attempt${data.scheduled === 1 ? '' : 's'} in the background.`,
          {
            description:
              'Items will drop off the queue as they finish. Refresh in a minute to see progress.',
          },
        );
      }

      router.refresh();
    } catch (error) {
      console.error('Bulk re-grade error:', error);
      toast.error('Bulk re-grade failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      aria-label="Re-grade all attempts in the attention queue"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading
        ? 'Scheduling…'
        : count === 0
          ? 'Re-grade all'
          : `Re-grade all (${count})`}
    </Button>
  );
}
