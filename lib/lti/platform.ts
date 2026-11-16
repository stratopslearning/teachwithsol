import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { ltiDeployments, ltiPlatforms } from '@/app/db/schema';
import { assertLtiEnabled, type LtiToolConfig } from '@/lib/lti/config';
export type EnsuredPlatform = {
  platform: typeof ltiPlatforms.$inferSelect;
  deployment: typeof ltiDeployments.$inferSelect;
  config: LtiToolConfig;
};

type ResolveLtiPlatformRow = {
  platform_id: string;
  workspace_id: string;
  tenant_id: string;
};

/**
 * Resolve which workspace owns the LTI platform row for env-configured Canvas.
 * Uses SECURITY DEFINER resolve_lti_platform so lookup works under FORCE RLS
 * before app.tenant_id is set; then sets the GUC from the result.
 */
export async function resolveLtiWorkspaceId(): Promise<string> {
  const config = assertLtiEnabled();
  const resolved = await db.execute(sql`
    SELECT * FROM resolve_lti_platform(${config.issuer}, ${config.clientId})
  `);
  const row = ((resolved as unknown as { rows?: ResolveLtiPlatformRow[] }).rows?.[0]
    ?? (Array.isArray(resolved)
      ? (resolved as unknown as ResolveLtiPlatformRow[])[0]
      : undefined)) as ResolveLtiPlatformRow | undefined;

  if (row?.workspace_id) {
    const tenantId = row.tenant_id || row.workspace_id;
    await db.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true)`,
    );
    return row.workspace_id;
  }

  const fromEnv = process.env.LTI_WORKSPACE_ID?.trim();
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) {
    await db.execute(
      sql`select set_config('app.tenant_id', ${fromEnv}, true)`,
    );
    return fromEnv;
  }

  throw new Error(
    'LTI workspace is ambiguous: link a platform row or set LTI_WORKSPACE_ID.',
  );
}

/** Upsert platform + deployment from env onto the given workspace (required). */
export async function ensurePlatformFromEnv(
  workspaceId: string,
): Promise<EnsuredPlatform> {
  const config = assertLtiEnabled();

  let platform = await db.query.ltiPlatforms.findFirst({
    where: and(
      eq(ltiPlatforms.workspaceId, workspaceId),
      eq(ltiPlatforms.issuer, config.issuer),
      eq(ltiPlatforms.clientId, config.clientId),
    ),
  });

  if (!platform) {
    const [created] = await db
      .insert(ltiPlatforms)
      .values({
        workspaceId,
        tenantId: workspaceId,
        issuer: config.issuer,
        clientId: config.clientId,
        authLoginUrl: config.authLoginUrl,
        authTokenUrl: config.authTokenUrl,
        keySetUrl: config.keySetUrl,
        label: config.platformLabel,
      })
      .returning();
    platform = created;
  } else {
    const [updated] = await db
      .update(ltiPlatforms)
      .set({
        authLoginUrl: config.authLoginUrl,
        authTokenUrl: config.authTokenUrl,
        keySetUrl: config.keySetUrl,
        label: config.platformLabel,
        updatedAt: new Date(),
      })
      .where(eq(ltiPlatforms.id, platform.id))
      .returning();
    platform = updated;
  }

  let deployment = await db.query.ltiDeployments.findFirst({
    where: and(
      eq(ltiDeployments.platformId, platform.id),
      eq(ltiDeployments.deploymentId, config.deploymentId),
    ),
  });

  if (!deployment) {
    const [created] = await db
      .insert(ltiDeployments)
      .values({
        platformId: platform.id,
        tenantId: platform.tenantId ?? workspaceId,
        deploymentId: config.deploymentId,
        status: 'ACTIVE',
      })
      .returning();
    deployment = created;
  } else if (deployment.status !== 'ACTIVE') {
    const [updated] = await db
      .update(ltiDeployments)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(ltiDeployments.id, deployment.id))
      .returning();
    deployment = updated;
  }

  return { platform, deployment, config };
}

export async function findDeploymentByPlatformDeployment(
  platformId: string,
  deploymentId: string,
) {
  return db.query.ltiDeployments.findFirst({
    where: and(
      eq(ltiDeployments.platformId, platformId),
      eq(ltiDeployments.deploymentId, deploymentId),
      eq(ltiDeployments.status, 'ACTIVE'),
    ),
  });
}
