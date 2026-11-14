import { notFound } from 'next/navigation';

import LessonReaderClient from './LessonReaderClient';
import { InteractiveChapterPlayer } from '@/components/lms/InteractiveChapterPlayer';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { withBasePath } from '@/lib/basePath';
import { requireStudent } from '@/lib/auth';
import { getStudentLessonDetail } from '@/lib/learning';
import { ApiError } from '@/lib/api/errors';
import { isInteractiveChapterBody } from '@/lib/lms/interactiveChapter';

export default async function StudentLessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStudent();
  const { id } = await params;

  let lesson;
  try {
    lesson = await getStudentLessonDetail(user.id, id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      notFound();
    }
    throw err;
  }

  const isChapter = isInteractiveChapterBody(lesson.chapter);

  return (
    <AppShell
      role="student"
      active="assignments"
      topbarTitle={lesson.title}
    >
      {isChapter ? (
        <div className="mx-auto w-full max-w-6xl px-1 pb-16 sm:px-2">
          <InteractiveChapterPlayer
            lessonId={lesson.id}
            title={lesson.title}
            courseTitle={lesson.courseTitle}
            chapter={lesson.chapter!}
            initialProgress={lesson.chapterProgress ?? []}
          />
        </div>
      ) : (
        <>
          <PageHeader
            breadcrumbs={[
              { label: 'Dashboard', href: withBasePath('/dashboard/student') },
              {
                label: 'Assignments',
                href: withBasePath('/dashboard/student/assignments'),
              },
              { label: lesson.title },
            ]}
            eyebrow={lesson.courseTitle || 'Lesson'}
            title={lesson.title}
            description="Read the notes, study the cards, then mark the lesson complete."
          />
          <LessonReaderClient lesson={lesson} />
        </>
      )}
    </AppShell>
  );
}
