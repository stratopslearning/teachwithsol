import { and, desc, eq, inArray } from 'drizzle-orm';

import { attempts, regradeRequests, users } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { readBySectionTenants } from '@/lib/db/sectionTenants';
import { withTenant } from '@/lib/db/tenantContext';
import { findInUserTenants } from '@/lib/db/userTenants';
import { loadAttemptForGrading, loadOwnAttempt } from '@/lib/quiz/gradingData';

// FORCE RLS: these used plain db reads/writes, which see no rows. Students
// could never file a regrade request, professors' lists were always empty,
// and resolving always 404'd. Attempts now come from the SECURITY DEFINER
// lookup (ownership checked) and everything else runs under the tenant.

export async function createRegradeRequest(opts: {
  attemptId: string;
  studentId: string;
  note: string;
}) {
  const own = await loadOwnAttempt(opts.attemptId, opts.studentId);
  const attempt = own?.attempt;
  if (!attempt?.submittedAt) {
    throw ApiError.badRequest('Only submitted attempts can be regrade-requested');
  }
  const note = opts.note.trim();
  if (!note) throw ApiError.badRequest('Note is required');

  if (!attempt.tenantId) {
    throw ApiError.badRequest('Attempt is missing tenant_id');
  }
  const tenantId = attempt.tenantId;

  const [row] = await withTenant(tenantId, opts.studentId, (tx) =>
    tx
      .insert(regradeRequests)
      .values({
        attemptId: opts.attemptId,
        tenantId,
        studentId: opts.studentId,
        note,
        status: 'open',
      })
      .returning(),
  );
  return row!;
}

export async function listOpenRegradeRequestsForProfessor(professorId: string) {
  const { listTeachingSectionIds } = await import(
    '@/lib/professor/graderSections'
  );
  const sectionIds = await listTeachingSectionIds({ id: professorId });
  if (sectionIds.length === 0) return [];

  const rows = await readBySectionTenants(sectionIds, professorId, (tx, ids) =>
    tx
      .select({
        id: regradeRequests.id,
        attemptId: regradeRequests.attemptId,
        note: regradeRequests.note,
        status: regradeRequests.status,
        createdAt: regradeRequests.createdAt,
        studentId: regradeRequests.studentId,
        studentFirstName: users.firstName,
        studentLastName: users.lastName,
        studentEmail: users.email,
        sectionId: attempts.sectionId,
        quizId: attempts.quizId,
      })
      .from(regradeRequests)
      .innerJoin(attempts, eq(attempts.id, regradeRequests.attemptId))
      .innerJoin(users, eq(users.id, regradeRequests.studentId))
      .where(
        and(
          eq(regradeRequests.status, 'open'),
          inArray(attempts.sectionId, ids),
        ),
      )
      .orderBy(desc(regradeRequests.createdAt))
      .limit(100),
  );

  return rows
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 100);
}

export async function getOpenRegradeRequestForAttempt(opts: {
  attemptId: string;
  studentId: string;
}) {
  const own = await loadOwnAttempt(opts.attemptId, opts.studentId);
  if (!own?.attempt.tenantId) return undefined;
  return withTenant(own.attempt.tenantId, opts.studentId, (tx) =>
    tx.query.regradeRequests.findFirst({
      where: and(
        eq(regradeRequests.attemptId, opts.attemptId),
        eq(regradeRequests.studentId, opts.studentId),
        eq(regradeRequests.status, 'open'),
      ),
      columns: { id: true, note: true, createdAt: true },
    }),
  );
}

export async function resolveRegradeRequestForProfessor(opts: {
  requestId: string;
  professorId: string;
}) {
  const found = await findInUserTenants(opts.professorId, async (tx, tenantId) => {
    const row = await tx.query.regradeRequests.findFirst({
      where: eq(regradeRequests.id, opts.requestId),
    });
    return row ? { row, tenantId } : undefined;
  });
  if (!found) throw ApiError.notFound('Regrade request not found');
  const { row, tenantId } = found;
  if (row.status !== 'open') {
    throw ApiError.badRequest('Regrade request is already closed');
  }

  const attempt = await loadAttemptForGrading(row.attemptId);
  if (!attempt) throw ApiError.notFound('Attempt not found');

  // Binding-derived teaching sections (professor_sections is metadata only).
  const { listTeachingSectionIds } = await import(
    '@/lib/professor/graderSections'
  );
  const teaching = await listTeachingSectionIds({ id: opts.professorId });
  if (!teaching.includes(attempt.sectionId)) {
    throw ApiError.forbidden('Not allowed to resolve this request');
  }

  const [updated] = await withTenant(tenantId, opts.professorId, (tx) =>
    tx
      .update(regradeRequests)
      .set({ status: 'resolved', resolvedAt: new Date() })
      .where(eq(regradeRequests.id, opts.requestId))
      .returning(),
  );
  return updated!;
}
