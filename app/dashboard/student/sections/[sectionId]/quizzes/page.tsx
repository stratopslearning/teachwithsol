import { appRedirect } from '@/lib/serverRedirect';

export const dynamic = 'force-dynamic';

/** Quizzes removed from course product nav — use Assignments. */
export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  appRedirect(`/dashboard/student/sections/${sectionId}/assignments`);
}
