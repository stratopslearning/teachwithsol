import { and, eq } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  ltiDeployments,
  ltiPlatforms,
  ltiSectionLinks,
  sections,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { authorize, tenantIdForSection } from '@/lib/authz/authorize';
import { logAudit } from '@/lib/audit';
import { activeOnly } from '@/lib/db/filters';
import type { UserData } from '@/lib/getOrCreateUser';
import { ensurePlatformFromEnv } from '@/lib/lti/platform';
import { assertTeachesSection } from '@/lib/professor/sections';

type LtiActor = Pick<UserData, 'id' | 'clerkId' | 'platformStaff'>;

/** Org lti.manage or section content.write (instructor linking Canvas). */
async function assertCanManageSectionLti(
  user: LtiActor,
  sectionId: string,
): Promise<void> {
  const tenantId = await tenantIdForSection(sectionId);
  if (!tenantId) throw ApiError.forbidden('LTI access denied');
  const orgOk = await authorize(user, 'lti.manage', {
    tenantId,
    scopeType: 'organization',
    scopeId: tenantId,
  });
  if (orgOk) return;
  await assertTeachesSection(user, sectionId);
}

export type SectionLinkRow = typeof ltiSectionLinks.$inferSelect;

export async function getSectionLink(
  sectionId: string,
): Promise<SectionLinkRow | null> {
  const row = await db.query.ltiSectionLinks.findFirst({
    where: eq(ltiSectionLinks.sectionId, sectionId),
  });
  return row ?? null;
}

export async function listSectionLinksWithMeta() {
  const links = await db.query.ltiSectionLinks.findMany({
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });
  if (links.length === 0) return [];

  const deploymentIds = [...new Set(links.map((l) => l.deploymentId))];
  const deployments = await db.query.ltiDeployments.findMany({
    where: (t, { inArray }) => inArray(t.id, deploymentIds),
  });
  const platformIds = [...new Set(deployments.map((d) => d.platformId))];
  const platforms = await db.query.ltiPlatforms.findMany({
    where: (t, { inArray }) => inArray(t.id, platformIds),
  });
  const sectionIds = links.map((l) => l.sectionId);
  const sectionRows = await db.query.sections.findMany({
    where: (t, { inArray }) => inArray(t.id, sectionIds),
    with: { course: true },
  });

  const depById = new Map(deployments.map((d) => [d.id, d]));
  const platById = new Map(platforms.map((p) => [p.id, p]));
  const secById = new Map(sectionRows.map((s) => [s.id, s]));

  return links.map((link) => {
    const dep = depById.get(link.deploymentId);
    const platform = dep ? platById.get(dep.platformId) : undefined;
    const section = secById.get(link.sectionId);
    return {
      id: link.id,
      sectionId: link.sectionId,
      sectionName: section?.name ?? null,
      courseTitle: section?.course?.title ?? null,
      canvasCourseId: link.canvasCourseId,
      canvasSectionId: link.canvasSectionId,
      hasAgs: Boolean(link.agsLineItemsUrl),
      hasNrps: Boolean(link.nrpsMembershipsUrl),
      platformLabel: platform?.label ?? platform?.issuer ?? null,
      deploymentId: dep?.deploymentId ?? null,
      updatedAt: link.updatedAt,
    };
  });
}

export async function linkSectionToCanvas(
  user: LtiActor,
  input: {
    sectionId: string;
    canvasCourseId: string;
    canvasSectionId?: string | null;
  },
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<SectionLinkRow> {
  await assertCanManageSectionLti(user, input.sectionId);

  const section = await db.query.sections.findFirst({
    where: and(
      eq(sections.id, input.sectionId),
      activeOnly(sections.deletedAt),
    ),
    with: { course: true },
  });
  if (!section) throw ApiError.notFound('Section not found');

  const canvasCourseId = input.canvasCourseId.trim();
  if (!canvasCourseId) {
    throw ApiError.badRequest('canvasCourseId is required');
  }

  const workspaceId = section.course?.workspaceId;
  if (!workspaceId) {
    throw ApiError.badRequest('Section course has no workspace; cannot link LTI.');
  }
  const { deployment } = await ensurePlatformFromEnv(workspaceId);

  const existing = await getSectionLink(input.sectionId);
  let row: SectionLinkRow;

  if (existing) {
    const [updated] = await db
      .update(ltiSectionLinks)
      .set({
        deploymentId: deployment.id,
        canvasCourseId,
        canvasSectionId: input.canvasSectionId?.trim() || null,
        linkedByUserId: user.id,
        updatedAt: new Date(),
      })
      .where(eq(ltiSectionLinks.id, existing.id))
      .returning();
    row = updated;
  } else {
    const [created] = await db
      .insert(ltiSectionLinks)
      .values({
        sectionId: input.sectionId,
        tenantId: section.tenantId ?? section.workspaceId ?? workspaceId,
        deploymentId: deployment.id,
        canvasCourseId,
        canvasSectionId: input.canvasSectionId?.trim() || null,
        linkedByUserId: user.id,
      })
      .returning();
    row = created;
  }

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'lti.section.link',
    targetType: 'section',
    targetId: input.sectionId,
    metadata: {
      canvasCourseId,
      canvasSectionId: input.canvasSectionId ?? null,
      linkId: row.id,
    },
    ip: audit?.ip,
    userAgent: audit?.userAgent,
  });

  return row;
}

export async function unlinkSectionFromCanvas(
  user: LtiActor,
  sectionId: string,
  audit?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  await assertCanManageSectionLti(user, sectionId);

  const existing = await getSectionLink(sectionId);
  if (!existing) return;

  await db
    .delete(ltiSectionLinks)
    .where(eq(ltiSectionLinks.id, existing.id));

  await logAudit({
    actorUserId: user.id,
    actorClerkId: user.clerkId,
    action: 'lti.section.unlink',
    targetType: 'section',
    targetId: sectionId,
    metadata: { linkId: existing.id },
    ip: audit?.ip,
    userAgent: audit?.userAgent,
  });
}

/** Refresh AGS/NRPS URLs from an LTI launch onto matching section link(s). */
export async function refreshLaunchEndpoints(opts: {
  canvasCourseId: string | null;
  contextId: string | null;
  agsLineItemsUrl: string | null;
  nrpsMembershipsUrl: string | null;
}): Promise<number> {
  if (!opts.agsLineItemsUrl && !opts.nrpsMembershipsUrl) return 0;

  const candidates = await db.query.ltiSectionLinks.findMany();
  const matches = candidates.filter((link) => {
    if (
      opts.canvasCourseId &&
      link.canvasCourseId === opts.canvasCourseId
    ) {
      return true;
    }
    if (opts.contextId && link.contextId === opts.contextId) return true;
    if (opts.contextId && link.canvasCourseId === opts.contextId) return true;
    return false;
  });

  let updated = 0;
  for (const link of matches) {
    await db
      .update(ltiSectionLinks)
      .set({
        contextId: opts.contextId ?? link.contextId,
        agsLineItemsUrl: opts.agsLineItemsUrl ?? link.agsLineItemsUrl,
        nrpsMembershipsUrl: opts.nrpsMembershipsUrl ?? link.nrpsMembershipsUrl,
        updatedAt: new Date(),
      })
      .where(eq(ltiSectionLinks.id, link.id));
    updated += 1;
  }
  return updated;
}

export async function findSectionLinkForLaunch(opts: {
  canvasCourseId: string | null;
  contextId: string | null;
  solSectionId?: string | null;
}): Promise<SectionLinkRow | null> {
  if (opts.solSectionId) {
    return getSectionLink(opts.solSectionId);
  }
  if (opts.canvasCourseId) {
    const byCourse = await db.query.ltiSectionLinks.findFirst({
      where: eq(ltiSectionLinks.canvasCourseId, opts.canvasCourseId),
    });
    if (byCourse) return byCourse;
  }
  if (opts.contextId) {
    const byContext = await db.query.ltiSectionLinks.findFirst({
      where: eq(ltiSectionLinks.contextId, opts.contextId),
    });
    if (byContext) return byContext;
    const byCourseAsContext = await db.query.ltiSectionLinks.findFirst({
      where: eq(ltiSectionLinks.canvasCourseId, opts.contextId),
    });
    return byCourseAsContext ?? null;
  }
  return null;
}

export async function getPlatformForSectionLink(link: SectionLinkRow) {
  const deployment = await db.query.ltiDeployments.findFirst({
    where: eq(ltiDeployments.id, link.deploymentId),
  });
  if (!deployment) return null;
  const platform = await db.query.ltiPlatforms.findFirst({
    where: eq(ltiPlatforms.id, deployment.platformId),
  });
  if (!platform) return null;
  return { deployment, platform };
}
