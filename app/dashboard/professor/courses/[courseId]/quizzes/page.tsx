import { redirect } from 'next/navigation';

import { withBasePath } from '@/lib/basePath';

export const dynamic = 'force-dynamic';

/** Quizzes removed from course product nav — use Assignments. */
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  redirect(
    withBasePath(`/dashboard/professor/courses/${courseId}/assignments`),
  );
}
