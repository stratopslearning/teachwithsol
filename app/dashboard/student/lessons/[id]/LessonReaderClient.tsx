'use client';

import { apiFetch } from '@/lib/api/client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { FlashcardsDeck } from '@/components/learning/FlashcardsDeck';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Flashcard = {
  id: string;
  front: string;
  back: string;
  position: number;
};

type LessonDetail = {
  id: string;
  title: string;
  markdown: string;
  courseTitle: string;
  flashcards: Flashcard[];
  progress: { status: 'STARTED' | 'COMPLETED'; completedAt: Date | null } | null;
};

export default function LessonReaderClient({
  lesson,
}: {
  lesson: LessonDetail;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState(lesson.progress);
  const hasCards = lesson.flashcards.length > 0;

  async function setStatus(status: 'STARTED' | 'COMPLETED') {
    try {
      const res = await apiFetch(`/api/student/lessons/${lesson.id}/progress`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not update progress');
        return;
      }
      setProgress(data.progress);
      toast.success(
        status === 'COMPLETED' ? 'Lesson marked complete' : 'Progress saved',
      );
      startTransition(() => router.refresh());
    } catch {
      toast.error('Could not update progress');
    }
  }

  return (
    <div className="mx-auto mt-8 flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge
          variant={progress?.status === 'COMPLETED' ? 'success' : 'outline'}
          className="font-normal"
        >
          {progress?.status === 'COMPLETED'
            ? 'Completed'
            : progress?.status === 'STARTED'
              ? 'In progress'
              : 'Not started'}
        </Badge>
        {progress?.status !== 'COMPLETED' ? (
          <div className="flex gap-2">
            {progress?.status !== 'STARTED' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setStatus('STARTED')}
              >
                Start
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={pending}
              onClick={() => setStatus('COMPLETED')}
            >
              Mark complete
            </Button>
          </div>
        ) : null}
      </div>

      <section className="rounded-xl border border-rule bg-surface paper-shadow px-5 py-6 sm:px-7 sm:py-8">
        <p className="eyebrow">Teaching notes</p>
        <article className="prose prose-neutral dark:prose-invert mt-4 max-w-none whitespace-pre-wrap text-base leading-relaxed text-ink">
          {lesson.markdown}
        </article>
      </section>

      {hasCards ? (
        <section className="flex flex-col gap-3">
          <div>
            <p className="eyebrow">Practice</p>
            <p className="mt-1 text-sm text-ink-muted">
              Flip through the deck to lock in the ideas from the notes above.
            </p>
          </div>
          <FlashcardsDeck cards={lesson.flashcards} />
        </section>
      ) : null}
    </div>
  );
}
