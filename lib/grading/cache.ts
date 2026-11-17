/**
 * SHA-256 keyed answer cache for the grading pipeline.
 *
 * Cache key = sha256(tenantId | questionId | rubricVersion | modelVersion | scoringVersion | materialsHash | normalize(answer))
 *
 * Auto-invalidates when:
 * - the question text or reference answer changes (caller bumps `rubricVersion`)
 * - we upgrade the grading model (caller bumps `GRADING_MODEL_VERSION`)
 * - we change deterministic scoring logic (caller bumps `SCORING_VERSION`)
 * - course-materials grading context changes (caller passes `materialsContextHash`)
 *
 * Normalization strips trivial differences (case, whitespace, trailing
 * punctuation) so "Quality assurance is a process." and "quality assurance
 * is a process" hit the same cache row.
 */
import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';

import { withTenant } from '@/lib/db/tenantContext';
import { gradingCache } from '@/app/db/schema';
import { hashCacheKey } from '@/lib/crypto/cacheKeyHmac';
import type {
  RubricCriterion,
  RubricMatch,
  StoredFeedback,
} from '@/lib/grading/types';

/** Bump when deterministic score computation changes (e.g. any-N top-N scoring). */
export const SCORING_VERSION = 2;

/**
 * Lowercase, collapse whitespace, drop trailing punctuation. Intentionally
 * conservative: we only want to bucket together answers that are obviously
 * the same. Semantic equivalence (paraphrasing) is not a cache concern.
 */
export function normalizeAnswerForCache(answer: string): string {
  return answer
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?\s]+$/g, '')
    .trim();
}

export function computeCacheKey(args: {
  questionId: string;
  studentAnswer: string;
  rubricVersion: number;
  modelVersion: string;
  /** Workspace tenant id; empty when unknown (legacy rows). */
  tenantId?: string;
  /** Hash of materials excerpt used in the grading prompt; empty when unused. */
  materialsContextHash?: string;
}): string {
  const normalized = normalizeAnswerForCache(args.studentAnswer);
  const materialsHash = args.materialsContextHash ?? '';
  const tenantId = args.tenantId ?? '';
  // Key material (verified, Wave 4 item 25): tenant + question + rubric/model/
  // scoring versions + materials hash + normalized answer. HMAC'd when
  // CACHE_KEY_HMAC_SECRET is set (item 27); legacy SHA-256 otherwise.
  return hashCacheKey(
    `${tenantId}|${args.questionId}|${args.rubricVersion}|${args.modelVersion}|${SCORING_VERSION}|${materialsHash}|${normalized}`,
  );
}

/** Stable short hash for materials text included in the grading prompt. */
export function hashMaterialsContext(text: string): string {
  if (!text.trim()) return '';
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export type CachedGradingPayload = {
  score: number;
  feedback: string;
  confidence: number;
  maxPoints: number;
  rubric: RubricCriterion[];
  rubricMatches: RubricMatch[];
  modelVersion: string;
  rubricVersion: number;
  requiredMatchCount?: number | null;
};

export async function lookupCachedGrading(args: {
  questionId: string;
  studentAnswer: string;
  rubricVersion: number;
  modelVersion: string;
  tenantId?: string;
  materialsContextHash?: string;
}): Promise<CachedGradingPayload | null> {
  if (!args.studentAnswer || !args.studentAnswer.trim()) return null;
  const key = computeCacheKey(args);
  // FORCE RLS: cache rows are tenant-scoped; without a tenant a read sees
  // nothing, so treat it as a miss.
  if (!args.tenantId) return null;
  const tenantId = args.tenantId;
  try {
    const row = await withTenant(tenantId, null, (tx) =>
      tx.query.gradingCache.findFirst({
        where: and(
          eq(gradingCache.key, key),
          eq(gradingCache.rubricVersion, args.rubricVersion),
          eq(gradingCache.modelVersion, args.modelVersion),
        ),
      }),
    );
    if (!row) return null;
    return row.payload as CachedGradingPayload;
  } catch (error) {
    // Cache lookup must NEVER block grading. A missing table / transient DB
    // error simply degrades to "always miss".
    console.warn('gradingCache.lookup failed:', error);
    return null;
  }
}

export async function writeCachedGrading(args: {
  questionId: string;
  studentAnswer: string;
  rubricVersion: number;
  modelVersion: string;
  tenantId?: string;
  materialsContextHash?: string;
  payload: CachedGradingPayload;
}): Promise<void> {
  if (!args.studentAnswer || !args.studentAnswer.trim()) return;
  const key = computeCacheKey(args);
  // FORCE RLS: write under the tenant and stamp tenant_id (a plain insert
  // was rejected, so the cache never filled).
  if (!args.tenantId) return;
  const tenantId = args.tenantId;
  try {
    await withTenant(tenantId, null, (tx) =>
      tx
        .insert(gradingCache)
        .values({
          key,
          tenantId,
          questionId: args.questionId,
          rubricVersion: args.rubricVersion,
          modelVersion: args.modelVersion,
          payload: args.payload,
        })
        .onConflictDoNothing({ target: gradingCache.key }),
    );
  } catch (error) {
    console.warn('gradingCache.write failed:', error);
  }
}

/**
 * Build a StoredFeedback from a cache hit. Caller sets `status: 'graded'` and
 * marks `cached: true`.
 */
export function cachedPayloadToFeedback(
  payload: CachedGradingPayload,
): StoredFeedback {
  return {
    score: payload.score,
    feedback: payload.feedback,
    confidence: payload.confidence,
    maxPoints: payload.maxPoints,
    status: 'graded',
    rubric: payload.rubric,
    rubricMatches: payload.rubricMatches,
    modelVersion: payload.modelVersion,
    rubricVersion: payload.rubricVersion,
    requiredMatchCount: payload.requiredMatchCount ?? undefined,
    gradedAt: new Date().toISOString(),
    cached: true,
  };
}
