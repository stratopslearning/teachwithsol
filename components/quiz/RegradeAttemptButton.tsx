'use client';

import { apiFetch } from '@/lib/api/client';
import { useState } from 'react';
import { RefreshCw } from '@/components/icons';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/feedback/ConfirmDialog';
import { useRouter } from 'next/navigation';

type RegradeAttemptButtonProps = {
  attemptId: string;
  /** Legacy fallback-graded questions ("Grading system temporarily unavailable"). */
  fallbackQuestionCount: number;
  /** Questions still marked pending or manual_review by the new pipeline. */
  pendingQuestionCount?: number;
  gradingStatus?: 'complete' | 'partial' | 'failed' | null;
};

export function RegradeAttemptButton({
  attemptId,
  fallbackQuestionCount,
  pendingQuestionCount = 0,
  gradingStatus = null,
}: RegradeAttemptButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const totalNeedsAttention = fallbackQuestionCount + pendingQuestionCount;

  async function handleRegrade() {
    const target =
      totalNeedsAttention > 0
        ? `Re-grade ${totalNeedsAttention} response${totalNeedsAttention === 1 ? '' : 's'} with AI? This may take up to a minute.`
        : 'Re-grade all short-answer responses with AI? This may take up to a minute.';

    if (!await confirmAction(target)) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiFetch(`/api/professor/attempt/${attemptId}/regrade`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // When pending/fallback items exist, target only those. Otherwise
            // regrade everything.
            fallbackOnly: totalNeedsAttention > 0,
          }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? 'Failed to re-grade attempt');
        return;
      }

      const stillPending = data?.pendingQuestionCount ?? 0;
      if (stillPending > 0) {
        toast.warning(
          `Re-graded ${data.regradedQuestionCount}. ${stillPending} question${
            stillPending === 1 ? '' : 's'
          } still pending. The background worker will retry shortly.`,
        );
      } else if (data.regradedQuestionCount > 0) {
        toast.success(
          `Re-graded ${data.regradedQuestionCount} response${data.regradedQuestionCount === 1 ? '' : 's'}. New score: ${data.percentage}%.`,
        );
      } else {
        toast.success('No responses needed re-grading.');
      }

      if (data.regradedQuestionCount > 0 || stillPending > 0) {
        router.refresh();
      }
    } catch (error) {
      console.error('Re-grade error:', error);
      toast.error('Failed to re-grade attempt');
    } finally {
      setIsLoading(false);
    }
  }

  const banner = pendingQuestionCount > 0 ? (
    <p className="text-xs text-warning-fg max-w-sm text-right">
      {pendingQuestionCount} response
      {pendingQuestionCount === 1 ? '' : 's'} still pending, queued for the
      background grader.
    </p>
  ) : fallbackQuestionCount > 0 ? (
    <p className="text-xs text-warning-fg max-w-sm text-right">
      {fallbackQuestionCount} response
      {fallbackQuestionCount === 1 ? '' : 's'} used legacy fallback grading and
      may need a fresh AI review.
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      {banner}
      {gradingStatus === 'failed' ? (
        <p className="text-xs text-danger-fg max-w-sm text-right">
          Grading hit the retry limit. Use re-grade to attempt again or assign
          a manual score.
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRegrade}
        disabled={isLoading}
      >
        <RefreshCw
          className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
        />
        {isLoading ? 'Re-grading…' : 'Re-grade with AI'}
      </Button>
    </div>
  );
}
