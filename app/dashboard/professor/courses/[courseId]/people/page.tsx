import { redirect } from 'next/navigation';

import { withBasePath } from '@/lib/basePath';

export const dynamic = 'force-dynamic';

/** People removed from course product nav (use Sections for roster). */
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  redirect(withBasePath(`/dashboard/professor/courses/${courseId}/sections`));
}
