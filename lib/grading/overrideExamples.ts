/**
 * Instructor override → few-shot grading examples (per-tenant, per-question).
 */
import { and, desc, eq, sql } from 'drizzle-orm';

import { gradingOverrideExamples } from '@/app/db/schema';
import { withTenant } from '@/lib/db/tenantContext';
import { minimizeStudentTextForAi } from '@/lib/ai/minimizeEducationPayload';
import { wrapStudentData } from '@/lib/ai/structured';
import type { RubricMatch } from '@/lib/grading/types';

const MAX_SNIPPET = 1_200;
const MAX_EXAMPLES = 5;

export async function recordOverrideExample(opts: {
  tenantId: string;
  questionId: string;
  rubricVersion: number;
  studentAnswer: string;
  aiMatches?: RubricMatch[] | null;
  instructorCriteria?: Record<string, boolean> | null;
  instructorScore?: number | null;
  note?: string | null;
}): Promise<void> {
  const snippet = minimizeStudentTextForAi(opts.studentAnswer).slice(
    0,
    MAX_SNIPPET,
  );
  if (!snippet.trim()) return;

  // FORCE RLS (drizzle/0119): writes need the tenant pinned.
  await withTenant(opts.tenantId, null, (tx) => tx.insert(gradingOverrideExamples).values({
    tenantId: opts.tenantId,
    questionId: opts.questionId,
    rubricVersion: opts.rubricVersion,
    studentAnswerSnippet: snippet,
    aiMatches: opts.aiMatches ?? null,
    instructorCriteria: opts.instructorCriteria ?? null,
    instructorScore: opts.instructorScore ?? null,
    note: opts.note?.trim() || null,
  }));
}

function lexicalOverlap(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2),
    );
  const A = tok(a);
  const B = tok(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / Math.max(A.size, B.size);
}

/** Format nearest prior overrides for injection into the grading prompt. */
export async function formatOverrideExamplesForPrompt(opts: {
  tenantId: string;
  questionId: string;
  rubricVersion: number;
  studentAnswer: string;
  k?: number;
}): Promise<string> {
  const k = opts.k ?? MAX_EXAMPLES;
  let rows: (typeof gradingOverrideExamples.$inferSelect)[] = [];
  try {
    rows = await withTenant(opts.tenantId, null, (tx) => tx.query.gradingOverrideExamples.findMany({
      where: and(
        eq(gradingOverrideExamples.tenantId, opts.tenantId),
        eq(gradingOverrideExamples.questionId, opts.questionId),
        eq(gradingOverrideExamples.rubricVersion, opts.rubricVersion),
      ),
      orderBy: [desc(gradingOverrideExamples.createdAt)],
      limit: 40,
    }));
  } catch {
    // Table may not exist before migration.
    return '';
  }

  if (rows.length === 0) return '';

  const ranked = rows
    .map((r) => ({
      row: r,
      score: lexicalOverlap(opts.studentAnswer, r.studentAnswerSnippet),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return ranked
    .map(({ row }, i) => {
      const criteria = row.instructorCriteria
        ? JSON.stringify(row.instructorCriteria)
        : 'n/a';
      const score =
        row.instructorScore != null ? String(row.instructorScore) : 'n/a';
      return `Example ${i + 1}:
${wrapStudentData('PRIOR STUDENT ANSWER', row.studentAnswerSnippet)}
Instructor criteria overrides: ${criteria}
Instructor score: ${score}
Note: ${row.note ?? '(none)'}`;
    })
    .join('\n\n');
}

/** Optional: count examples for a question (ops / UI). */
export async function countOverrideExamples(
  tenantId: string,
  questionId: string,
): Promise<number> {
  try {
    const [row] = await withTenant(tenantId, null, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(gradingOverrideExamples)
        .where(
          and(
            eq(gradingOverrideExamples.tenantId, tenantId),
            eq(gradingOverrideExamples.questionId, questionId),
          ),
        ),
    );
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}
