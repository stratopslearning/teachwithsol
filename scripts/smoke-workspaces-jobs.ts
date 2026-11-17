/**
 * Local smoke: workspaces schema + jobs enqueue helpers against DATABASE_URL.
 *   npx tsx scripts/smoke-workspaces-jobs.ts
 */
import { config as loadEnv } from 'dotenv';

import { assertDevDatabaseOrExit } from './lib/assertDevDatabase';

loadEnv({ path: '.env', quiet: true });
loadEnv({ path: '.env.local', override: true, quiet: true });

assertDevDatabaseOrExit({ urlEnvVars: ['DATABASE_URL'] });

async function main() {
  const { neonConfig } = await import('@neondatabase/serverless');
  const ws = (await import('ws')).default;
  if (typeof WebSocket === 'undefined') {
    neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
  }

  const schema = await import('../app/db/schema');
  const { jobsBackend } = await import('../lib/jobs/backend');
  const {
    assertSeatAvailable,
    countActiveLearners,
    ensureDefaultWorkspace,
    getActiveLicense,
  } = await import('../lib/workspace/access');
  const { eq } = await import('drizzle-orm');
  const { Pool } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');

  function ok(label: string, detail?: string) {
    console.log(`OK  ${label}${detail ? ` — ${detail}` : ''}`);
  }
  function fail(label: string, err: unknown): never {
    console.error(`FAIL ${label}`, err);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('postgres')) {
    throw new Error('DATABASE_URL missing');
  }

  const wsRow = await ensureDefaultWorkspace();
  ok('ensureDefaultWorkspace', `${wsRow.slug} (${wsRow.type})`);

  if (wsRow.id !== schema.DEFAULT_WORKSPACE_ID) {
    fail('default workspace id', wsRow.id);
  }

  const license = await getActiveLicense(wsRow.id);
  if (!license) fail('active license', 'missing');
  ok('getActiveLicense', `${license.plan} seats=${license.seatCap}`);

  const used = await countActiveLearners(wsRow.id);
  ok('countActiveLearners', String(used));

  const seats = await assertSeatAvailable(wsRow.id);
  if (!seats.ok) fail('assertSeatAvailable', seats.reason);
  ok('assertSeatAvailable', `${seats.used}/${seats.cap}`);

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  const courses = await db.query.courses.findMany({
    where: eq(schema.courses.workspaceId, schema.DEFAULT_WORKSPACE_ID),
    limit: 3,
  });
  ok('courses scoped to default workspace', `sample=${courses.length}`);

  const platforms = await db.query.ltiPlatforms.findMany({
    where: eq(schema.ltiPlatforms.workspaceId, schema.DEFAULT_WORKSPACE_ID),
    limit: 3,
  });
  ok('lti_platforms.workspace_id column', `rows=${platforms.length}`);

  ok('JOBS_BACKEND', jobsBackend());

  const {
    enqueueGradeAttempt,
    enqueueMaterialProcess,
    enqueueLtiPassbackDrain,
  } = await import('../lib/jobs/enqueue');
  await enqueueGradeAttempt(
    '00000000-0000-4000-8000-000000000099',
    wsRow.id,
  );
  ok('enqueueGradeAttempt (no throw)');
  await enqueueMaterialProcess(
    '00000000-0000-4000-8000-000000000098',
    wsRow.id,
  );
  ok('enqueueMaterialProcess (no throw)');
  await enqueueLtiPassbackDrain(1);
  ok('enqueueLtiPassbackDrain (no throw)');

  await pool.end();
  console.log('\nAll workspace/jobs smokes passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
