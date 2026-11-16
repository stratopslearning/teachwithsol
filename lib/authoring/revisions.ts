import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import {
  authoringRevisions,
  courseOutlines,
  outlineItems,
  outlineModules,
  type OutlineItemBody,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { assertCanManageOutline } from '@/lib/authoring/access';
import {
  getOutlineDetail,
  type OutlineDetail,
} from '@/lib/authoring/outlines';
import { withOutlineTenant } from '@/lib/authoring/tenant';
import {
  fetchAuthoringRevisionById,
  fetchOutlineById,
  insertAuthoringRevisionDefiner,
} from '@/lib/db/entityScopedReads';
import type { AuthUser } from '@/lib/getOrCreateUser';

export type AuthoringRevisionSummary = {
  id: string;
  outlineId: string;
  label: string;
  createdAt: Date;
  createdByUserId: string | null;
};

export type OutlineSnapshot = {
  title: string;
  status: string;
  bodiesBuilt: boolean;
  hasPriorCorpus: boolean;
  modules: Array<{
    id: string;
    title: string;
    summary: string | null;
    position: number;
    items: Array<{
      id: string;
      type: string;
      title: string;
      status: string;
      position: number;
      body: OutlineItemBody;
      faithfulBody: OutlineItemBody | null;
      variantOfItemId: string | null;
    }>;
  }>;
};

export function snapshotFromOutline(detail: OutlineDetail): OutlineSnapshot {
  return {
    title: detail.title,
    status: detail.status,
    bodiesBuilt: detail.bodiesBuilt,
    hasPriorCorpus: detail.hasPriorCorpus,
    modules: detail.modules.map((m) => ({
      id: m.id,
      title: m.title,
      summary: m.summary,
      position: m.position,
      items: m.items.map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        status: i.status,
        position: i.position,
        body: i.body,
        faithfulBody: i.faithfulBody,
        variantOfItemId: i.variantOfItemId,
      })),
    })),
  };
}

export async function createAuthoringRevision(
  user: AuthUser,
  outlineId: string,
  label: string,
  snapshot?: OutlineSnapshot,
): Promise<AuthoringRevisionSummary> {
  const outline = await assertCanManageOutline(user, outlineId);
  const detail = snapshot ? null : await getOutlineDetail(user, outlineId);
  const snap = snapshot ?? snapshotFromOutline(detail!);
  const tenantId =
    outline.tenantId ??
    (await fetchOutlineById(outlineId))?.tenantId ??
    null;

  const id = await insertAuthoringRevisionDefiner({
    outlineId,
    tenantId,
    userId: user.id,
    label: label.slice(0, 200),
    snapshot: snap,
  });

  return {
    id,
    outlineId,
    label: label.slice(0, 200),
    createdAt: new Date(),
    createdByUserId: user.id,
  };
}

export async function listAuthoringRevisions(
  user: AuthUser,
  outlineId: string,
): Promise<AuthoringRevisionSummary[]> {
  await assertCanManageOutline(user, outlineId);
  return withOutlineTenant(outlineId, user.id, async (tx) => {
    const rows = await tx.query.authoringRevisions.findMany({
      where: eq(authoringRevisions.outlineId, outlineId),
      orderBy: [desc(authoringRevisions.createdAt)],
      limit: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      outlineId: r.outlineId,
      label: r.label,
      createdAt: r.createdAt,
      createdByUserId: r.createdByUserId,
    }));
  });
}

export async function restoreAuthoringRevision(
  user: AuthUser,
  revisionId: string,
): Promise<OutlineDetail> {
  const revision = await fetchAuthoringRevisionById(revisionId);
  if (!revision) throw ApiError.notFound('Revision not found');
  await assertCanManageOutline(user, revision.outlineId);

  const snap = revision.snapshot as unknown as OutlineSnapshot;
  if (!snap?.modules || !Array.isArray(snap.modules)) {
    throw ApiError.badRequest('Revision snapshot is invalid');
  }

  await createAuthoringRevision(
    user,
    revision.outlineId,
    `Before restore: ${revision.label}`,
  );

  const { restoreAuthoringSnapshotDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  await restoreAuthoringSnapshotDefiner({
    outlineId: revision.outlineId,
    snapshot: snap,
  });

  return getOutlineDetail(user, revision.outlineId);
}

/** Soft helper used when listing oldest → newest for UI. */
export async function listAuthoringRevisionsAsc(
  user: AuthUser,
  outlineId: string,
) {
  await assertCanManageOutline(user, outlineId);
  return withOutlineTenant(outlineId, user.id, async (tx) =>
    tx.query.authoringRevisions.findMany({
      where: eq(authoringRevisions.outlineId, outlineId),
      orderBy: [asc(authoringRevisions.createdAt)],
      limit: 50,
    }),
  );
}
