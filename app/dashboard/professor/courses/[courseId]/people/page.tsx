import { appRedirect } from "@/lib/serverRedirect";

export const dynamic = 'force-dynamic';

/** People removed from course product nav (use Sections for roster). */
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  appRedirect(`/dashboard/professor/courses/${courseId}/sections`);
}
