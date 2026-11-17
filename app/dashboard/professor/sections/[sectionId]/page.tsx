import { notFound } from 'next/navigation';

import { requireTeachingAccess } from '@/lib/authz/gates';
import { assertTeachesSection } from '@/lib/professor/sections';
import { appRedirect } from '@/lib/serverRedirect';
import { loadSectionDetailData } from '@/lib/sections/detailData';

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

  appRedirect(`/dashboard/professor/courses/${courseId}/sections/${sectionId}`);
}
