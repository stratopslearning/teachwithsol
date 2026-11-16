/**
 * Read-only verification on a branch copy as sol_app: the old plain read of a
 * quiz's questions vs loadQuizQuestions (under the attempt's tenant).
 *   DATABASE_URL=<sol_app branch url> npx tsx scripts/spike/verify-grading-reads.mts
 */
import { desc, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/app/db';
import { attempts, questions } from '@/app/db/schema';
import { loadAttemptForGrading, loadQuizQuestions } from '@/lib/quiz/gradingData';
import { withTenant } from '@/lib/db/tenantContext';

async function main() {
  const tenantPrefix = process.argv[2] ?? (() => { throw new Error('usage: pass a workspace id prefix'); })();

  // Find the tenant's latest submitted attempt id (needs the tenant set).
  const users = (await db.execute(`select id::text as id from users`)) as unknown as { rows: { id: string }[] };
  let tenant: string | null = null;
  for (const u of users.rows) {
    const found = await db.transaction(async (tx) => {
      await tx.execute(`select set_config('app.user_id', '${u.id}', true)`);
      const r = (await tx.execute(
        `select id::text as id from workspaces where id::text like '${tenantPrefix}%'`,
      )) as unknown as { rows: { id: string }[] };
      return r.rows[0]?.id ?? null;
    });
    if (found) {
      tenant = found;
      break;
    }
  }
  if (!tenant) throw new Error('tenant not found');

  const latest = await withTenant(tenant, null, (tx) =>
    tx.query.attempts.findFirst({
      where: isNotNull(attempts.submittedAt),
      orderBy: desc(attempts.submittedAt),
    }),
  );
  if (!latest) throw new Error('no submitted attempt');

  const plain = await db.query.questions.findMany({ where: eq(questions.quizId, latest.quizId) });
  const viaAttempt = await loadAttemptForGrading(latest.id);
  const fixed = await loadQuizQuestions(latest.quizId, viaAttempt!.tenantId!);

  console.log('attempt', latest.id.slice(0, 8), 'submitted', latest.submittedAt?.toISOString());
  console.log('old plain db read  → questions:', plain.length);
  console.log('loadAttemptForGrading → tenant matches:', viaAttempt?.tenantId === tenant);
  console.log('loadQuizQuestions  → questions:', fixed.length);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
