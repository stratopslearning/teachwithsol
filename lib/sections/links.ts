/**
 * section_links writers (Wave 3 item 21): cross-listed / merged section aliases
 * and non-roster external identifiers. LTI platform links still live in
 * lti_section_links; this table is the neutral alias layer.
 */
import { and, eq } from 'drizzle-orm';

import { sectionLinks } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { tenantIdForSection } from '@/lib/authz';
import { withTenant } from '@/lib/db/tenantContext';

export type SectionLinkKind = 'lti' | 'alias';

export type SectionLinkInput = {
  solSectionId: string;
  externalKind: SectionLinkKind;
  externalId: string;
  metadata?: Record<string, unknown> | null;
};

export function normalizeExternalId(raw: string): string {
  return raw.trim();
}

// FORCE RLS: plain db reads/writes saw no rows, so links never listed,
// saved, unlinked or resolved. Every call now runs under the tenant.

export async function listSectionLinks(solSectionId: string) {
  const tenantId = await tenantIdForSection(solSectionId);
  if (!tenantId) return [];
  return withTenant(tenantId, null, (tx) =>
    tx.query.sectionLinks.findMany({
      where: eq(sectionLinks.solSectionId, solSectionId),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    }),
  );
}

/**
 * Idempotent link: (tenant, kind, externalId) is globally unique. Re-linking
 * the same external id to the SAME section updates metadata; linking it to a
 * DIFFERENT section is a conflict (unlink first).
 */
export async function linkSection(input: SectionLinkInput) {
  const externalId = normalizeExternalId(input.externalId);
  if (!externalId) throw ApiError.badRequest('externalId is required');

  const tenantId = await tenantIdForSection(input.solSectionId);
  if (!tenantId) throw ApiError.notFound('Section not found');

  return withTenant(tenantId, null, async (tx) => {
    const existing = await tx.query.sectionLinks.findFirst({
      where: and(
        eq(sectionLinks.tenantId, tenantId),
        eq(sectionLinks.externalKind, input.externalKind),
        eq(sectionLinks.externalId, externalId),
      ),
    });

    if (existing) {
      if (existing.solSectionId !== input.solSectionId) {
        throw ApiError.conflict(
          'That external id is already linked to a different section',
        );
      }
      const [row] = await tx
        .update(sectionLinks)
        .set({
          metadata: input.metadata ?? existing.metadata,
          updatedAt: new Date(),
        })
        .where(eq(sectionLinks.id, existing.id))
        .returning();
      return { link: row!, created: false };
    }

    const [row] = await tx
      .insert(sectionLinks)
      .values({
        tenantId,
        solSectionId: input.solSectionId,
        externalKind: input.externalKind,
        externalId,
        metadata: input.metadata ?? null,
      })
      .returning();
    return { link: row!, created: true };
  });
}

export async function unlinkSection(
  solSectionId: string,
  linkId: string,
): Promise<boolean> {
  const tenantId = await tenantIdForSection(solSectionId);
  if (!tenantId) return false;
  const rows = await withTenant(tenantId, null, (tx) =>
    tx
      .delete(sectionLinks)
      .where(
        and(
          eq(sectionLinks.id, linkId),
          eq(sectionLinks.solSectionId, solSectionId),
        ),
      )
      .returning({ id: sectionLinks.id }),
  );
  return rows.length > 0;
}

/** Resolve an external id (e.g. a registrar cross-list code) to a SOL section. */
export async function resolveSectionByExternalId(
  tenantId: string,
  externalKind: SectionLinkKind,
  externalId: string,
): Promise<string | null> {
  const row = await withTenant(tenantId, null, (tx) =>
    tx.query.sectionLinks.findFirst({
      where: and(
        eq(sectionLinks.tenantId, tenantId),
        eq(sectionLinks.externalKind, externalKind),
        eq(sectionLinks.externalId, normalizeExternalId(externalId)),
      ),
      columns: { solSectionId: true },
    }),
  );
  return row?.solSectionId ?? null;
}
