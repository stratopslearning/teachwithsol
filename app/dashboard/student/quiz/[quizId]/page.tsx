import { appRedirect } from '@/lib/serverRedirect';

/**
 * Legacy / mistyped student quiz URLs under the dashboard shell.
 * Canonical take path is `/quiz/[quizId]`.
 */
export default async function StudentQuizRedirectPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  appRedirect(`/quiz/${quizId}`);
}
