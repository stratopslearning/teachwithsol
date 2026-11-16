import { sql } from 'drizzle-orm';

import { withTenant } from '@/lib/db/tenantContext';
import { embedQuery, toPgVectorLiteral } from '@/lib/knowledge/embed';
import {
  MATERIALS_RETRIEVE_TOP_K,
  SAFE_MATERIALS_CONTEXT_CHAR_BUDGET,
} from '@/lib/knowledge/constants';
import { rowsFromExecute } from '@/lib/db/rows';
import {
  includeLegacyCourseMaterialChunks,
  includeSharedKnowledgeChunks,
} from '@/lib/knowledge/retireLegacyMaterials';

export type RetrievedChunk = {
  id: string;
  materialId: string;
  content: string;
  distance: number;
  title: string;
  /** shared = workspace knowledge link; course = legacy course_materials / books */
  origin: 'course' | 'shared';
  versionId?: string | null;
};

function mapRetrievedRows(
  list: Array<{
    id: string;
    material_id: string;
    content: string;
    distance: number;
    title: string;
    origin: string;
    version_id: string | null;
  }>,
): RetrievedChunk[] {
  return list.map((r) => ({
    id: String(r.id),
    materialId: String(r.material_id),
    content: String(r.content),
    distance: Number(r.distance),
    title: String(r.title || 'Untitled'),
    origin: r.origin === 'shared' ? 'shared' : 'course',
    versionId: r.version_id ? String(r.version_id) : null,
  }));
}

/**
 * Top-k cosine-distance chunks for a course. Returns [] on any failure so
 * chatbot callers can fall back to quiz-stem-only context.
 */
export async function retrieveCourseChunks(
  courseId: string,
  query: string,
  opts?: {
    k?: number;
    /** Hard tenant wall — required (do not rely on RLS alone). */
    tenantId: string;
    /** Optional offering soft wall when known. */
    offeringId?: string | null;
    /** Restrict knowledge links + legacy materials by authoring corpus tag. */
    corpus?: 'prior_course' | 'this_term';
    /**
     * Optional focus set: knowledge document ids and/or course_materials ids.
     * Empty / omitted = use the full course corpus (agent default).
     */
    materialIds?: string[];
  },
): Promise<RetrievedChunk[]> {
  const q = query.trim();
  if (!q || !courseId) return [];
  if (!opts?.tenantId) {
    console.error('retrieveCourseChunks refused: tenantId required');
    return [];
  }
  if (!process.env.OPENAI_API_KEY) return [];

  try {
    const embedding = await embedQuery(q);
    const k = opts?.k ?? MATERIALS_RETRIEVE_TOP_K;
    const vectorLiteral = toPgVectorLiteral(embedding);
    const corpus = opts?.corpus ?? null;
    const tenantId = opts.tenantId;
    const offeringId = opts.offeringId ?? null;
    const materialIds = (opts?.materialIds ?? []).filter(Boolean);
    // course_knowledge_links has no offering_id yet; offering soft-wall applies to legacy materials.
    const offeringFilterLegacy =
      offeringId
        ? sql`AND (cm.offering_id IS NULL OR cm.offering_id = ${offeringId}::uuid)`
        : sql``;

    // FORCE RLS: pin tenant GUC so knowledge_* / course_* tables are visible.
    return await withTenant(tenantId, null, async (tx) => {
      // Focus may pass legacy course_materials ids while chunks live on the
      // mirrored knowledge_documents — expand to both sides of the mirror.
      let focusIds = materialIds;
      if (materialIds.length > 0) {
        const mirrorRows = await tx.execute<{
          doc_id: string | null;
          material_id: string | null;
        }>(sql`
          SELECT kd.id::text AS doc_id,
                 kd.legacy_material_id::text AS material_id
          FROM knowledge_documents kd
          WHERE kd.tenant_id = ${tenantId}::uuid
            AND kd.deleted_at IS NULL
            AND (
              kd.id IN (${sql.join(
                materialIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
              OR kd.legacy_material_id IN (${sql.join(
                materialIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
            )
        `);
        const list = rowsFromExecute<{
          doc_id: string | null;
          material_id: string | null;
        }>(mirrorRows);
        const expanded = new Set(materialIds);
        for (const row of list) {
          if (row.doc_id) expanded.add(String(row.doc_id));
          if (row.material_id) expanded.add(String(row.material_id));
        }
        focusIds = [...expanded];
      }
      const resolvedFocusFilter =
        focusIds.length > 0
          ? sql`AND source_id IN (${sql.join(
              focusIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : sql``;

      const result = await tx.execute<{
        id: string;
        material_id: string;
        content: string;
        distance: number;
        title: string;
        origin: string;
        version_id: string | null;
      }>(sql`
        WITH linked AS (
          SELECT kc.id,
                 kc.document_id::text AS material_id,
                 kc.document_id AS source_id,
                 kc.content,
                 (kc.embedding <=> ${vectorLiteral}::vector) AS distance,
                 kd.title AS title,
                 'shared'::text AS origin,
                 kc.version_id::text AS version_id
          FROM knowledge_chunks kc
          INNER JOIN course_knowledge_links ckl
            ON ckl.document_id = kc.document_id
           AND ckl.pinned_version_id = kc.version_id
          INNER JOIN knowledge_documents kd
            ON kd.id = kc.document_id
           AND kd.deleted_at IS NULL
          WHERE ckl.course_id = ${courseId}::uuid
            AND kc.tenant_id = ${tenantId}::uuid
            AND ckl.tenant_id = ${tenantId}::uuid
            AND kd.tenant_id = ${tenantId}::uuid
            AND kc.deleted_at IS NULL
            AND kc.superseded_at IS NULL
            AND kc.embedding IS NOT NULL
            AND (${corpus}::text IS NULL OR ckl.authoring_corpus = ${corpus})
        ),
        legacy AS (
          SELECT cmc.id,
                 cmc.material_id::text AS material_id,
                 cmc.material_id AS source_id,
                 cmc.content,
                 (cmc.embedding <=> ${vectorLiteral}::vector) AS distance,
                 cm.title AS title,
                 'course'::text AS origin,
                 NULL::text AS version_id
          FROM course_material_chunks cmc
          INNER JOIN course_materials cm
            ON cm.id = cmc.material_id
           AND cm.deleted_at IS NULL
          WHERE cmc.course_id = ${courseId}::uuid
            AND cmc.tenant_id = ${tenantId}::uuid
            AND cm.tenant_id = ${tenantId}::uuid
            AND cmc.deleted_at IS NULL
            AND cmc.embedding IS NOT NULL
            AND (${corpus}::text IS NULL OR cm.authoring_corpus = ${corpus})
            ${offeringFilterLegacy}
        ),
        combined AS (
          SELECT * FROM linked
          WHERE ${includeSharedKnowledgeChunks()}
          UNION ALL
          SELECT * FROM legacy
          WHERE ${includeLegacyCourseMaterialChunks()}
        )
        SELECT id, material_id, content, distance, title, origin, version_id
        FROM combined
        WHERE true
        ${resolvedFocusFilter}
        ORDER BY distance
        LIMIT ${k}
      `);

      return mapRetrievedRows(
        rowsFromExecute<{
          id: string;
          material_id: string;
          content: string;
          distance: number;
          title: string;
          origin: string;
          version_id: string | null;
        }>(result),
      );
    });
  } catch (err) {
    console.error('retrieveCourseChunks failed', err);
    return [];
  }
}

/**
 * Non-embedding fallback for authoring when vector retrieve returns empty
 * (embed outage, focus-id mismatch, transient SQL). Prefers shared library
 * chunks pinned on the course.
 */
export async function listCourseChunksFallback(
  courseId: string,
  opts: {
    tenantId: string;
    k?: number;
    materialIds?: string[];
  },
): Promise<RetrievedChunk[]> {
  const k = opts.k ?? MATERIALS_RETRIEVE_TOP_K;
  const materialIds = (opts.materialIds ?? []).filter(Boolean);
  if (!courseId || !opts.tenantId) return [];

  try {
    return await withTenant(opts.tenantId, null, async (tx) => {
      let focusIds = materialIds;
      if (materialIds.length > 0) {
        const mirrorRows = await tx.execute<{
          doc_id: string | null;
          material_id: string | null;
        }>(sql`
          SELECT kd.id::text AS doc_id,
                 kd.legacy_material_id::text AS material_id
          FROM knowledge_documents kd
          WHERE kd.tenant_id = ${opts.tenantId}::uuid
            AND kd.deleted_at IS NULL
            AND (
              kd.id IN (${sql.join(
                materialIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
              OR kd.legacy_material_id IN (${sql.join(
                materialIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
            )
        `);
        const expanded = new Set(materialIds);
        for (const row of rowsFromExecute<{
          doc_id: string | null;
          material_id: string | null;
        }>(mirrorRows)) {
          if (row.doc_id) expanded.add(String(row.doc_id));
          if (row.material_id) expanded.add(String(row.material_id));
        }
        focusIds = [...expanded];
      }

      const focusFilter =
        focusIds.length > 0
          ? sql`AND kd.id IN (${sql.join(
              focusIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : sql``;

      const result = await tx.execute<{
        id: string;
        material_id: string;
        content: string;
        distance: number;
        title: string;
        origin: string;
        version_id: string | null;
      }>(sql`
        SELECT kc.id,
               kc.document_id::text AS material_id,
               left(kc.content, 4000) AS content,
               0::float8 AS distance,
               kd.title AS title,
               'shared'::text AS origin,
               kc.version_id::text AS version_id
        FROM knowledge_chunks kc
        INNER JOIN course_knowledge_links ckl
          ON ckl.document_id = kc.document_id
         AND ckl.pinned_version_id = kc.version_id
        INNER JOIN knowledge_documents kd
          ON kd.id = kc.document_id
         AND kd.deleted_at IS NULL
        WHERE ckl.course_id = ${courseId}::uuid
          AND kc.tenant_id = ${opts.tenantId}::uuid
          AND ckl.tenant_id = ${opts.tenantId}::uuid
          AND kd.tenant_id = ${opts.tenantId}::uuid
          AND kc.deleted_at IS NULL
          AND kc.superseded_at IS NULL
          AND kc.content IS NOT NULL
          ${focusFilter}
        ORDER BY kd.title ASC, kc.id ASC
        LIMIT ${k}
      `);

      return mapRetrievedRows(
        rowsFromExecute<{
          id: string;
          material_id: string;
          content: string;
          distance: number;
          title: string;
          origin: string;
          version_id: string | null;
        }>(result),
      );
    });
  } catch (err) {
    console.error('listCourseChunksFallback failed', err);
    return [];
  }
}

/** Format retrieved chunks for the chatbot system prompt (budgeted). */
export function buildSafeMaterialsContext(
  chunks: RetrievedChunk[],
  budget = SAFE_MATERIALS_CONTEXT_CHAR_BUDGET,
): string {
  if (!chunks.length) return '';
  const lines: string[] = [
    'Course materials context (LEARNING MODE: excerpts only, no answer keys):',
  ];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const originLabel =
      chunk.origin === 'shared' ? 'shared library' : 'course material';
    const block = `Excerpt ${i + 1} — From: ${chunk.title} (${originLabel}):\n${chunk.content.trim()}`;
    const candidate = [...lines, block].join('\n\n');
    if (candidate.length > budget) {
      lines.push('(Additional excerpts omitted to stay within context budget.)');
      break;
    }
    lines.push(block);
  }
  return lines.join('\n\n');
}

/** Student-facing citation footnotes from retrieved chunks (deduped). */
export function buildCitationFootnotes(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return '';
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const chunk of chunks) {
    const key = `${chunk.origin}:${chunk.materialId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const originLabel =
      chunk.origin === 'shared' ? 'shared library' : 'course material';
    lines.push(`- ${chunk.title} (${originLabel})`);
  }
  if (!lines.length) return '';
  return `Sources:\n${lines.join('\n')}`;
}
