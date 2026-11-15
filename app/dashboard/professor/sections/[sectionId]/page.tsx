import { notFound, redirect } from 'next/navigation';

import { requireTeachingAccess } from '@/lib/authz/gates';
import { withBasePath } from '@/lib/basePath';
import { assertTeachesSection } from '@/lib/professor/sections';
import { loadSectionDetailData } from '@/lib/sectionDetailData';

export const dynamic = 'force-dynamic';

/**
 * Legacy standalone section URL — send faculty into the course hub so roster,
 * invites, and codes live with the rest of the course.
 */
export default async function SectionDetailsPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;

  const me = await requireTeachingAccess();
  try {
    await assertTeachesSection(me, sectionId);
  } catch {
    return notFound();
  }

  const data = await loadSectionDetailData(sectionId);
  if (!data) return notFound();

  const courseId = data.section.course?.id;
  if (!courseId) return notFound();

  redirect(
    withBasePath(
      `/dashboard/professor/courses/${courseId}/sections/${sectionId}`,
    ),
  );
}
