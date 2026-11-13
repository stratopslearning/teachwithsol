import { redirect } from 'next/navigation';

import { withBasePath } from '@/lib/basePath';

export const dynamic = 'force-dynamic';

/** Quizzes removed from course product nav — use Assignments. */
export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  redirect(
    withBasePath(`/dashboard/student/sections/${sectionId}/assignments`),
  );
}
