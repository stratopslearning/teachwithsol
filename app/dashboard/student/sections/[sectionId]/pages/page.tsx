import { redirect } from 'next/navigation';

import { withBasePath } from '@/lib/basePath';

export const dynamic = 'force-dynamic';

/** Pages removed from course product nav. */
export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  redirect(withBasePath(`/dashboard/student/sections/${sectionId}`));
}
