import { appRedirect } from "@/lib/serverRedirect";

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  appRedirect(`/dashboard/student/sections/${sectionId}`);
}
