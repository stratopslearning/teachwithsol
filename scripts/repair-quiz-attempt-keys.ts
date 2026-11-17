/**
 * Permanently remap attempt answers/gpt_feedback from legacy question UUIDs
 * to the quiz's current question ids (after a delete-and-reinsert edit).
 *
 * Usage:
 *   npx tsx scripts/repair-quiz-attempt-keys.ts <quizId> [--dry-run] --confirm-dev-db
 */
import './lib/bootstrapDevDb';

import { eq } from 'drizzle-orm';

import { db } from '@/app/db';
import { attempts, questions } from '@/app/db/schema';
import { remapAttemptPayloadKeys } from '@/lib/quiz/attemptAnswers';

const quizId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!quizId) {
  console.error('Usage: npx tsx scripts/repair-quiz-attempt-keys.ts <quizId> [--dry-run]');
  process.exit(1);
}

async function main() {
  const quizQuestions = await db.query.questions.findMany({
    where: eq(questions.quizId, quizId),
    columns: { id: true, order: true, question: true, correctAnswer: true },
    orderBy: (table, { asc }) => [asc(table.order)],
  });

  if (quizQuestions.length === 0) {
    console.error('No questions found for quiz', quizId);
    process.exit(1);
  }

  const submittedAttempts = await db.query.attempts.findMany({
    where: eq(attempts.quizId, quizId),
    columns: { id: true, answers: true, gptFeedback: true, submittedAt: true },
  });

  let repaired = 0;
  let skipped = 0;

  for (const attempt of submittedAttempts) {
    if (!attempt.submittedAt) {
      skipped += 1;
      continue;
    }

    const answers =
      attempt.answers && typeof attempt.answers === 'object'
        ? (attempt.answers as Record<string, unknown>)
        : {};
    const gptFeedback =
      attempt.gptFeedback && typeof attempt.gptFeedback === 'object'
        ? (attempt.gptFeedback as Record<string, unknown>)
        : {};

    const remapped = remapAttemptPayloadKeys(quizQuestions, answers, gptFeedback);
    const remappedAny = remapped.keyMap.size > 0;

    if (!remappedAny) {
      skipped += 1;
      continue;
    }

    const needsWrite =
      [...remapped.keyMap.entries()].some(
        ([currentId, storageKey]) => currentId !== storageKey,
      ) ||
      JSON.stringify(remapped.answers) !== JSON.stringify(answers) ||
      JSON.stringify(remapped.gptFeedback) !== JSON.stringify(gptFeedback);

    if (!needsWrite) {
      skipped += 1;
      continue;
    }

    repaired += 1;
    console.log(`Repair attempt ${attempt.id}`);

    if (!dryRun) {
      await db
        .update(attempts)
        .set({
          answers: remapped.answers,
          gptFeedback: remapped.gptFeedback,
        })
        .where(eq(attempts.id, attempt.id));
    }
  }

  console.log(
    dryRun
      ? `Dry run complete. Would repair ${repaired} attempts (${skipped} unchanged).`
      : `Repaired ${repaired} attempts (${skipped} unchanged).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
