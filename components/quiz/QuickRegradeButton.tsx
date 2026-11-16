'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
import { RefreshCw } from '@/components/icons';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type QuickRegradeButtonProps = {
  attemptId: string;
  /** Optional label override. Defaults to "Re-grade". */
  label?: string;
  /** When true, the button is compact (icon-only on narrow screens). */
  compact?: boolean;
};

/**
 * Inline one-click re-grade button. Targets only the questions that are
 * still pending / fallback / manual_review on the given attempt. Used from
 * list views (e.g. the professor attention queue) where space is tight and
 * a single click should kick off the regrade and refresh the row.
 */
export function QuickRegradeButton({
  attemptId,
  label = 'Re-grade',
  compact = false,
}: QuickRegradeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleRegrade() {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/professor/attempt/${attemptId}/regrade`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fallbackOnly: true }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? 'Re-grade failed');
        return;
      }

      const stillPending = data?.pendingQuestionCount ?? 0;
      const regraded = data?.regradedQuestionCount ?? 0;

      if (regraded === 0 && stillPending === 0) {
        toast.success('No questions needed re-grading.');
      } else if (stillPending > 0) {
        toast.warning(
          `Re-graded ${regraded}. ${stillPending} still pending. Will retry in background.`,
        );
      } else {
        toast.success(
          `Re-graded ${regraded} question${regraded === 1 ? '' : 's'}. Score: ${data.percentage}%.`,
        );
      }

      router.refresh();
    } catch (error) {
      console.error('Quick re-grade error:', error);
      toast.error('Re-grade failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleRegrade}
      disabled={isLoading}
      aria-label="Re-grade attempt"
    >
      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''} ${compact ? '' : 'mr-2'}`} />
      {compact ? null : isLoading ? 'Re-grading…' : label}
    </Button>
  );
}
