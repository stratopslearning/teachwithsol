/**
 * Hard assessment lock: during an active quiz attempt, quiz stems/keys must
 * not enter the tutor context at all (code gate, not prompt-only).
 */
import { and, eq, isNull } from 'drizzle-orm';

import { attempts } from '@/app/db/schema';
import { withQuizTenant } from '@/lib/db/sectionTenants';

/** True when the student has an open (unsubmitted) attempt on this quiz. */
export async function studentHasActiveAttemptForQuiz(
  studentId: string,
  quizId: string,
): Promise<boolean> {
  // FORCE RLS: a plain db read never saw the open attempt, so the lock never
  // engaged and quiz content could reach the tutor mid-attempt. Read under
  // the quiz's tenant.
  const open = await withQuizTenant(quizId, studentId, (tx) =>
    tx.query.attempts.findFirst({
      where: and(
        eq(attempts.studentId, studentId),
        eq(attempts.quizId, quizId),
        isNull(attempts.submittedAt),
      ),
      columns: { id: true },
    }),
  );
  return Boolean(open);
}

/**
 * True when the student has an open attempt on the chatbot's related quiz.
 * (`sectionId` is accepted for callers; the old section branch re-checked the
 * same quiz, so it never changed the answer.)
 */
export async function shouldLockQuizContext(opts: {
  studentId: string;
  relatedQuizId: string | null | undefined;
  sectionId?: string | null;
}): Promise<boolean> {
  if (!opts.relatedQuizId) return false;
  return studentHasActiveAttemptForQuiz(opts.studentId, opts.relatedQuizId);
}

export const NOT_IN_MATERIALS_REPLY =
  'That doesn’t appear in your course materials. I can only help with what’s in this course — want me to flag your instructor?';

/** Extract simple struggle topic tags from a student message (heuristic). */
export function extractStruggleTopics(message: string): string[] {
  const text = message.toLowerCase();
  const tags: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\b(confus(ed|ing)|don't understand|do not understand|stuck)\b/, 'confusion'],
    [/\b(formula|equation|calculate|computation)\b/, 'calculation'],
    [/\b(definition|mean(s|ing)|what is)\b/, 'definitions'],
    [/\b(example|apply|application)\b/, 'application'],
    [/\b(difference between|compare|versus|vs\.?)\b/, 'comparison'],
  ];
  for (const [re, tag] of patterns) {
    if (re.test(text)) tags.push(tag);
  }
  return tags.slice(0, 5);
}
