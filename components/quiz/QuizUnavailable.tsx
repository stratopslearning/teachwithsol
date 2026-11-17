'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Clock, FileText } from '@/components/icons';
import { toast } from 'sonner';

import { EmptyState } from '@/components/patterns/EmptyState';
import { useDisplayTimeZone } from '@/components/timezone/TimeZoneProvider';
import { Button } from '@/components/ui/button';
import {
  getQuizBlockCopy,
  isInformationalQuizBlock,
  type QuizBlockCode,
} from '@/lib/quiz/blockCopy';
import { formatDateTimeStable } from '@/lib/utils';

function labelFor(
  value: Date | string | null | undefined,
  timeZone: string | null,
): string | null {
  if (!value || !timeZone) return null;
  const label = formatDateTimeStable(value, timeZone);
  return label === 'Invalid date' ? null : label;
}

export function QuizUnavailable({
  code,
  quizTitle,
  opensAt,
  closedAt,
}: {
  code: QuizBlockCode;
  quizTitle?: string | null;
  opensAt?: Date | string | null;
  closedAt?: Date | string | null;
}) {
  const timeZone = useDisplayTimeZone();
  const copy = getQuizBlockCopy(code, {
    opensAtLabel: labelFor(opensAt, timeZone),
    closedAtLabel: labelFor(closedAt, timeZone),
  });
  const toasted = useRef(false);

  useEffect(() => {
    if ((opensAt || closedAt) && !timeZone) return;
    if (toasted.current) return;
    toasted.current = true;
    const toastFn = isInformationalQuizBlock(code) ? toast.info : toast.error;
    toastFn(copy.title, { description: copy.description, duration: 8000 });
  }, [code, copy.description, copy.title, opensAt, closedAt, timeZone]);

  return (
    <EmptyState
      icon={
        code === 'quiz_not_started' ? (
          <Clock className="h-5 w-5" />
        ) : (
          <FileText className="h-5 w-5" />
        )
      }
      eyebrow={quizTitle || 'Quiz'}
      title={copy.title}
      description={copy.description}
      actions={
        <Button asChild>
          <Link href="/dashboard/student/assignments">Back to assignments</Link>
        </Button>
      }
    />
  );
}
