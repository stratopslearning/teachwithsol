import { appRedirect } from '@/lib/serverRedirect';

export default async function StudentSectionWorkRedirect({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  appRedirect(`/dashboard/student/sections/${sectionId}/assignments`);
}
