'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import {
  getQuizBlockCopy,
  isInformationalQuizBlock,
  parseQuizBlockCode,
} from '@/lib/quiz/blockCopy';

/**
 * Surfaces `?error=` / `?message=` query params as a toast, then strips them
 * from the URL so a refresh does not replay the notice.
 */
export function UrlErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shownKey = useRef<string | null>(null);

  const error = searchParams.get('error');
  const message = searchParams.get('message');

  useEffect(() => {
    if (!error && !message) return;
    const key = `${error ?? ''}|${message ?? ''}`;
    if (shownKey.current === key) return;
    shownKey.current = key;

    const code = parseQuizBlockCode(error);
    const copy = code
      ? getQuizBlockCopy(code)
      : {
          title: 'Something went wrong',
          description: message || 'Please try again.',
        };
    const description = message || copy.description;
    const toastFn =
      code && isInformationalQuizBlock(code) ? toast.info : toast.error;
    toastFn(copy.title, { description, duration: 8000 });

    const next = new URLSearchParams(searchParams.toString());
    next.delete('error');
    next.delete('message');
    next.delete('quizId');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [error, message, pathname, router, searchParams]);

  return null;
}
