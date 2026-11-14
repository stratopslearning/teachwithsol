import { redirect } from 'next/navigation';

import { appPath } from '@/lib/basePath';
import { requireTeachingAccess } from '@/lib/authz/gates';

export const dynamic = 'force-dynamic';

/** Global Assignments hub removed — manage assignments inside each course. */
export default async function ProfessorAssignmentsLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; type?: string }>;
}) {
  await requireTeachingAccess();
  const params = await searchParams;
  if (params.courseId) {
    redirect(
      appPath(`/dashboard/professor/courses/${params.courseId}/assignments`),
    );
  }
  redirect(appPath('/dashboard/professor/courses'));
}
