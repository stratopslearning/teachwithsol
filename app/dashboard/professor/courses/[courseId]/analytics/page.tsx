import { appRedirect } from "@/lib/serverRedirect";

export const dynamic = 'force-dynamic';

/** Course Analytics removed from product nav. */
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  appRedirect(`/dashboard/professor/courses/${courseId}`);
}
