/**
 * LTI rows live in FORCE-RLS tables whose tenant_id is NOT NULL (0039/0040).
 * Every LTI write must stamp the tenant. Runs the real lib/lti code.
 */
import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ltiDeployments, ltiPlatforms } from '@/app/db/schema';
import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeWorkspace } from '../helpers/factories';

const skip = !process.env.TEST_DATABASE_URL;

describe.skipIf(skip)('lti tenant-stamped writes', () => {
  let db: TestDb;
  let workspaceId: string;
  const issuer = `https://canvas.test/${randomUUID()}`;
  const clientId = `client-${randomUUID()}`;
  const deploymentId = `dep-${randomUUID()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    Object.assign(process.env, {
      LTI_ENABLED: 'true',
      LTI_ISSUER: issuer,
      LTI_CLIENT_ID: clientId,
      LTI_AUTH_LOGIN_URL: 'https://canvas.test/api/lti/authorize_redirect',
      LTI_AUTH_TOKEN_URL: 'https://canvas.test/login/oauth2/token',
      LTI_KEY_SET_URL: 'https://canvas.test/api/lti/security/jwks',
      LTI_DEPLOYMENT_ID: deploymentId,
      LTI_TOOL_PRIVATE_KEY: 'test-private-key',
      LTI_TOOL_PUBLIC_KEY: 'test-public-key',
      LTI_TOOL_KEY_ID: 'kid-test',
    });
    db = getTestDb();
    workspaceId = (await makeWorkspace(db)).id;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('ensurePlatformFromEnv creates platform and deployment rows stamped with the workspace tenant', async () => {
    const { ensurePlatformFromEnv } = await import('@/lib/lti/platform');
    const ensured = await ensurePlatformFromEnv(workspaceId);

    const platform = await db.query.ltiPlatforms.findFirst({
      where: and(eq(ltiPlatforms.issuer, issuer), eq(ltiPlatforms.clientId, clientId)),
    });
    const deployment = await db.query.ltiDeployments.findFirst({
      where: eq(ltiDeployments.id, ensured.deployment.id),
    });
    expect(platform?.tenantId).toBe(workspaceId);
    expect(deployment?.tenantId).toBe(workspaceId);
    expect(deployment?.deploymentId).toBe(deploymentId);
  });
});
