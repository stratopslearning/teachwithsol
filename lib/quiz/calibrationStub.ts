import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { attempts, gradeOverrides } from '@/app/db/schema';
import { withQuizTenant } from '@/lib/db/sectionTenants';

export type CalibrationSample = {
  attemptId: string;
  studentLabel: string;
  autoScore: number | null;
  instructorScore: number | null;
  disagrees: boolean;
};

export type CalibrationStubSummary = {
  quizId: string;
  sampleSize: number;
  disagreementCount: number;
  samples: CalibrationSample[];
};

/** Stub calibration view: compares auto % vs stored instructor override when present. */
export async function getCalibrationStubForQuiz(
  quizId: string,
  sampleSize = 5,
): Promise<CalibrationStubSummary> {
  const n = Math.max(1, Math.min(sampleSize, 20));
  // FORCE RLS: plain db reads return nothing; read under the quiz's tenant.
  const { rows, overrides } = (await withQuizTenant(quizId, null, async (tx) => {
    const rows = await tx.query.attempts.findMany({
      where: and(eq(attempts.quizId, quizId), isNotNull(attempts.submittedAt)),
      with: { student: true },
      orderBy: [desc(attempts.submittedAt)],
      limit: n,
    });
    const attemptIds = rows.map((r) => r.id);
    const overrides =
      attemptIds.length > 0
        ? await tx.query.gradeOverrides.findMany({
            where: inArray(gradeOverrides.attemptId, attemptIds),
          })
        : [];
    return { rows, overrides };
  })) ?? { rows: [], overrides: [] };
  const overrideCountByAttempt = new Map<string, number>();
  for (const o of overrides) {
    overrideCountByAttempt.set(
      o.attemptId,
      (overrideCountByAttempt.get(o.attemptId) ?? 0) + 1,
    );
  }

  const samples: CalibrationSample[] = rows.map((row) => {
    const autoScore = row.percentage ?? null;
    const overrideCount = overrideCountByAttempt.get(row.id) ?? 0;
    const instructorScore =
      overrideCount > 0 && autoScore != null ? autoScore : null;
    const disagrees = overrideCount > 0;
    const student = row.student;
    const studentLabel =
      [student.firstName, student.lastName].filter(Boolean).join(' ') ||
      student.email ||
      'Student';
    return {
      attemptId: row.id,
      studentLabel,
      autoScore,
      instructorScore,
      disagrees,
    };
  });

  return {
    quizId,
    sampleSize: samples.length,
    disagreementCount: samples.filter((s) => s.disagrees).length,
    samples,
  };
}
