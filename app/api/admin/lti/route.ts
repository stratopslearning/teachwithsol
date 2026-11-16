import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { requirePlatformStaffApi } from '@/lib/api/sessionAuth';
import { getLtiConfig } from '@/lib/lti/config';
import { listSectionLinksWithMeta } from '@/lib/lti/links';
import {
  ensurePlatformFromEnv,
  resolveLtiWorkspaceId,
} from '@/lib/lti/platform';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePlatformStaffApi();
  } catch (err) {
    return apiErrorResponse(err);
  }
  const cfg = getLtiConfig();

  let platform: {
    issuer: string;
    clientId: string;
    label: string | null;
    deploymentId: string;
  } | null = null;

  if (cfg.enabled) {
    try {
      const ltiWorkspaceId = await resolveLtiWorkspaceId();
      const ensured = await ensurePlatformFromEnv(ltiWorkspaceId);
      platform = {
        issuer: ensured.platform.issuer,
        clientId: ensured.platform.clientId,
        label: ensured.platform.label,
        deploymentId: ensured.deployment.deploymentId,
      };
    } catch {
      platform = null;
    }
  }

  const links = await listSectionLinksWithMeta();

  return NextResponse.json({
    enabled: cfg.enabled,
    urls: cfg.enabled
      ? {
          loginUrl: cfg.loginUrl,
          launchUrl: cfg.launchUrl,
          jwksUrl: cfg.jwksUrl,
        }
      : null,
    platform,
    links,
  });
}
