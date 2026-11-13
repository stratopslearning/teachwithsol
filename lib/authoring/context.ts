import { ApiError } from '@/lib/api/errors';
import {
  AUTHORING_CONTEXT_CHAR_BUDGET,
  AUTHORING_RETRIEVE_TOP_K,
} from '@/lib/authoring/constants';
import {
  fetchCourseAuthoringChunks,
  fetchCourseById,
} from '@/lib/db/entityScopedReads';
import {
  retrieveCourseChunks,
  type RetrievedChunk,
} from '@/lib/knowledge/retrieve';

/**
 * Resolve RLS tenant key for a course.
 * Product "tenant" = workspace row (department / org unit) — always required for
 * materials retrieve under FORCE RLS. Not an optional institution-only field.
 * Uses SECURITY DEFINER lookup so we can resolve tenant before withTenant().
 */
async function tenantIdForCourse(courseId: string): Promise<string> {
  const course = await fetchCourseById(courseId);
  const tenantId = course?.tenantId ?? course?.workspaceId;
  if (!tenantId) {
    throw ApiError.badRequest('Course is missing tenant_id');
  }
  return tenantId;
}

export type AuthoringCorpus = 'prior_course' | 'this_term';

export type CourseCorpusStatus = {
  readyCount: number;
  priorTaggedCount: number;
  thisTermTaggedCount: number;
  hasPriorCorpus: boolean;
};

/** Counts READY uploads/links plus corpus tags (including Knowledge attachments). */
export async function getCourseAuthoringMaterialStats(
  courseId: string,
): Promise<CourseCorpusStatus> {
  // FORCE RLS: bare materials/links reads return 0 without tenant GUC.
  const { fetchCourseAuthoringMaterialStats } = await import(
    '@/lib/db/entityScopedReads'
  );
  return fetchCourseAuthoringMaterialStats(courseId);
}

/** Require at least one READY material before generation. */
export async function assertCourseHasReadyMaterials(
  courseId: string,
): Promise<number> {
  const status = await getCourseAuthoringMaterialStats(courseId);
  if (status.readyCount === 0 && status.priorTaggedCount + status.thisTermTaggedCount === 0) {
    throw ApiError.badRequest(
      'Add and index at least one READY course material before generating an outline',
    );
  }
  if (status.readyCount === 0) {
    // Knowledge links only — still allow if links exist (shared KB may be READY).
    const linkCount = status.priorTaggedCount + status.thisTermTaggedCount;
    if (linkCount === 0) {
      throw ApiError.badRequest(
        'Add and index at least one READY course material before generating an outline',
      );
    }
  }
  return Math.max(status.readyCount, 1);
}

function formatChunks(
  label: string,
  chunks: RetrievedChunk[],
  budget: number,
): { text: string; used: number; chunks: RetrievedChunk[] } {
  const lines: string[] = [label];
  let used = label.length;
  const kept: RetrievedChunk[] = [];
  for (const c of chunks) {
    const origin = c.origin === 'shared' ? 'shared library' : 'course material';
    const block = `\n---\n[${c.title} · ${origin} · id:${c.materialId} chunk:${c.id}]\n${c.content}`;
    if (used + block.length > budget) break;
    lines.push(block);
    used += block.length;
    kept.push(c);
  }
  return { text: lines.join(''), used, chunks: kept };
}

/**
 * Professor-scoped materials context for authoring.
 * When prior_course materials exist, retrieves a prior-weighted + this-term mix.
 */
export async function buildAuthoringMaterialsContext(
  courseId: string,
  query: string,
  opts?: {
    k?: number;
    budget?: number;
    corpus?: AuthoringCorpus;
    preferPrior?: boolean;
    /** Empty / omitted = full course corpus (agent default). */
    materialIds?: string[];
  },
): Promise<{
  text: string;
  chunks: RetrievedChunk[];
  hasPriorCorpus: boolean;
}> {
  const budget = opts?.budget ?? AUTHORING_CONTEXT_CHAR_BUDGET;
  const k = opts?.k ?? AUTHORING_RETRIEVE_TOP_K;
  const stats = await getCourseAuthoringMaterialStats(courseId);
  const hasPrior = stats.hasPriorCorpus;
  const materialIds = opts?.materialIds?.filter(Boolean);
  const focus =
    materialIds && materialIds.length > 0 ? { materialIds } : undefined;

  const tenantId = await tenantIdForCourse(courseId);

  async function definerChunks(focusIds?: string[]): Promise<RetrievedChunk[]> {
    // SECURITY DEFINER — same path as materials list; does not need withTenant.
    let rows = await fetchCourseAuthoringChunks(courseId, {
      limit: k,
      focusIds,
    });
    if (rows.length === 0 && focusIds && focusIds.length > 0) {
      rows = await fetchCourseAuthoringChunks(courseId, { limit: k });
    }
    return rows;
  }

  async function resolveChunks(
    retrieveOpts: {
      k?: number;
      corpus?: AuthoringCorpus;
      materialIds?: string[];
    },
  ): Promise<RetrievedChunk[]> {
    try {
      const vector = await retrieveCourseChunks(courseId, query, {
        tenantId,
        ...retrieveOpts,
      });
      if (vector.length > 0) return vector;
    } catch (err) {
      console.error(
        '[authoring] vector retrieve failed; using DEFINER chunks',
        err,
      );
    }

    // withTenant vector path empty/flaky under FORCE RLS — DEFINER fallback.
    return definerChunks(retrieveOpts.materialIds);
  }

  if (opts?.corpus) {
    const chunks = await resolveChunks({
      k,
      corpus: opts.corpus,
      ...focus,
    });
    const formatted = formatChunks(
      `Course materials excerpts for AUTHORING (${opts.corpus}):`,
      chunks,
      budget,
    );
    return {
      text: formatted.text,
      chunks: formatted.chunks,
      hasPriorCorpus: hasPrior,
    };
  }

  if (hasPrior && opts?.preferPrior !== false && !focus) {
    const priorK = Math.max(Math.ceil(k * 0.7), 6);
    const termK = Math.max(Math.ceil(k * 0.4), 4);
    const [priorChunks, termChunks] = await Promise.all([
      resolveChunks({
        k: priorK,
        corpus: 'prior_course',
      }),
      resolveChunks({
        k: termK,
        corpus: 'this_term',
      }),
    ]);

    const prior = formatChunks(
      'PRIOR COURSE materials (faithful structure + assignment mimic):',
      priorChunks,
      Math.floor(budget * 0.7),
    );
    const remaining = budget - prior.used;
    const term = formatChunks(
      '\n\nTHIS TERM materials (updates / gaps):',
      termChunks,
      remaining > 200 ? remaining : Math.floor(budget * 0.3),
    );
    return {
      text: [prior.text, term.text].filter(Boolean).join(''),
      chunks: [...prior.chunks, ...term.chunks],
      hasPriorCorpus: true,
    };
  }

  const chunks = await resolveChunks({
    k,
    ...focus,
  });
  if (!chunks.length && focus?.materialIds?.length) {
    // Book RAG rows can be READY without embeddings / before DEFINER
    // fallback includes course_material_chunks — use chapter markdown.
    const bookText = await buildBookChapterContextForMaterialIds(
      courseId,
      focus.materialIds,
      budget,
    );
    if (bookText.trim()) {
      return { text: bookText, chunks: [], hasPriorCorpus: hasPrior };
    }
  }
  if (!chunks.length) {
    return { text: '', chunks: [], hasPriorCorpus: hasPrior };
  }
  const formatted = formatChunks(
    focus
      ? 'Focused course materials excerpts for AUTHORING (faculty-selected):'
      : 'Course materials excerpts for AUTHORING (faculty draft context):',
    chunks,
    budget,
  );
  return {
    text: formatted.text,
    chunks: formatted.chunks,
    hasPriorCorpus: hasPrior,
  };
}

/** Chapter markdown for book-linked course_materials focus ids. */
async function buildBookChapterContextForMaterialIds(
  courseId: string,
  materialIds: string[],
  budget: number,
): Promise<string> {
  const focus = new Set(materialIds);
  const { fetchBookLinkedMaterialIdsDefiner, fetchBookChaptersForRagDefiner } =
    await import('@/lib/db/knowledgeJobDefiners');
  const linked = await fetchBookLinkedMaterialIdsDefiner(courseId);
  if (!linked.some((id) => focus.has(id))) return '';

  const { fetchHostedBooksForCourseDefiner } = await import(
    '@/lib/db/bookWriteDefiners'
  );
  const books = await fetchHostedBooksForCourseDefiner(courseId);
  const bookIds = books.filter((b) => b.status === 'READY').map((b) => b.id);
  if (bookIds.length === 0) return '';

  const lines: string[] = [
    'Focused hosted book excerpts for AUTHORING (faculty-selected):',
  ];
  let used = lines[0]!.length;
  for (const bookId of bookIds) {
    const chapters = await fetchBookChaptersForRagDefiner(bookId);
    const matched = chapters.filter(
      (c) => c.materialId && focus.has(c.materialId),
    );
    if (matched.length === 0) continue;
    for (const ch of matched) {
      const header = `\n---\n[chapter:${ch.title}]\n`;
      const body = ch.markdown.trim().slice(0, 2_400);
      const block = `${header}${body}`;
      if (used + block.length > budget) {
        const remaining = budget - used - header.length;
        if (remaining < 200) break;
        lines.push(`${header}${body.slice(0, remaining)}`);
        used = budget;
        break;
      }
      lines.push(block);
      used += block.length;
    }
    if (used >= budget) break;
  }
  return lines.length <= 1 ? '' : lines.join('');
}

/** Search materials for MCP / agents: returns chunk payloads, not S3 bytes. */
export async function searchCourseMaterialsForAuthoring(
  courseId: string,
  query: string,
  opts?: { k?: number; corpus?: AuthoringCorpus },
): Promise<
  Array<{
    chunkId: string;
    materialId: string;
    content: string;
    distance: number;
  }>
> {
  const tenantId = await tenantIdForCourse(courseId);
  const chunks = await retrieveCourseChunks(courseId, query, {
    k: opts?.k ?? AUTHORING_RETRIEVE_TOP_K,
    tenantId,
    corpus: opts?.corpus,
  });
  return chunks.map((c) => ({
    chunkId: c.id,
    materialId: c.materialId,
    content: c.content,
    distance: c.distance,
  }));
}
