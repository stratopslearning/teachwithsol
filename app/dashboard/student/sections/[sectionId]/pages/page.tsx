import { appRedirect } from "@/lib/serverRedirect";

export const dynamic = 'force-dynamic';

/** Pages removed from course product nav. */
export default async function Page({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const { sectionId } = await params;
  appRedirect(`/dashboard/student/sections/${sectionId}`);
}
