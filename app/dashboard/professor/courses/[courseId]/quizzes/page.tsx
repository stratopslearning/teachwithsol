import { appRedirect } from '@/lib/serverRedirect';

export const dynamic = 'force-dynamic';

/** Quizzes removed from course product nav — use Assignments. */
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  appRedirect(`/dashboard/professor/courses/${courseId}/assignments`);
}
