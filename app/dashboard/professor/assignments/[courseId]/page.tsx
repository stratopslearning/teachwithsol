import { redirect } from 'next/navigation';

import { appPath } from '@/lib/basePath';
import { requireTeachingAccess } from '@/lib/authz/gates';

export const dynamic = 'force-dynamic';

/** Prefer course hub Assignments over the old global tool shell. */
export default async function ProfessorAssignmentsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requireTeachingAccess();
  const { courseId } = await params;
  redirect(
    appPath(`/dashboard/professor/courses/${courseId}/assignments`),
  );
}
