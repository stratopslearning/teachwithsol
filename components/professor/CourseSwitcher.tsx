'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { appPath, withBasePath } from '@/lib/basePath';
import { fillCourseHrefTemplate } from '@/lib/professor/courseHref';

export type CourseSwitcherOption = {
  id: string;
  title: string;
};

type Props = {
  courses: CourseSwitcherOption[];
  activeCourseId: string;
  /**
   * Serializable path template with `{courseId}` placeholder.
   * Example: `/dashboard/professor/authoring/{courseId}`
   */
  hrefTemplate?: string;
  /** Persist activeCourseId on mount (deep links / hub redirects). */
  persistOnMount?: boolean;
  className?: string;
};

/** Best-effort cookie write — never block navigation on compile/restart flakes. */
async function persistActiveCourse(courseId: string) {
  try {
    await fetch(withBasePath('/api/professor/active-course'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId }),
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Dev server restarts / first-compile stalls surface as TypeError: Failed to fetch.
  }
}

export function CourseSwitcher({
  courses,
  activeCourseId,
  hrefTemplate,
  persistOnMount = true,
  className,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const persisted = useRef<string | null>(null);

  useEffect(() => {
    if (!persistOnMount || !activeCourseId) return;
    if (persisted.current === activeCourseId) return;
    persisted.current = activeCourseId;
    void persistActiveCourse(activeCourseId);
  }, [activeCourseId, persistOnMount]);

  if (courses.length === 0) return null;

  return (
    <Select
      value={activeCourseId}
      disabled={pending || courses.length === 1}
      onValueChange={(courseId) => {
        startTransition(async () => {
          await persistActiveCourse(courseId);
          if (hrefTemplate) {
            router.push(
              appPath(fillCourseHrefTemplate(hrefTemplate, courseId)),
            );
          } else {
            router.refresh();
          }
        });
      }}
    >
      <SelectTrigger
        className={className ?? 'h-8 w-auto max-w-[16rem] min-w-0 shrink text-xs'}
        aria-label="Active course"
      >
        <SelectValue placeholder="Course" />
      </SelectTrigger>
      <SelectContent>
        {courses.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
