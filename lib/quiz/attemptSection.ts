/**
 * Pick which section context to stamp on a new attempt when a learner is
 * enrolled in multiple sections that share the same quiz.
 *
 * Submit previously used `findFirst`, which returned an arbitrary row and
 * caused attempts to land under the wrong section: hiding them from the
 * professor's results for the section they actually teach.
 */
import { resolveAttemptSectionDefiner } from '@/lib/db/studentWriteDefiners';

export async function resolveAttemptSectionId(
  studentId: string,
  quizSectionIds: string[],
  preferredSectionId?: string | null,
): Promise<string | null> {
  return resolveAttemptSectionDefiner(
    studentId,
    quizSectionIds,
    preferredSectionId,
  );
}
