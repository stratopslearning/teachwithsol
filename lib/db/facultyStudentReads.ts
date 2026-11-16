/**
 * Faculty desk + workspace team + student enrollment DEFINER reads (0053).
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { asUuidArray } from '@/lib/db/sqlArrays';
import { asDate, rowsFromExecute } from '@/lib/db/rows';

export async function fetchSectionLearnerCounts(
  sectionIds: string[],
): Promise<Map<string, number>> {
  if (sectionIds.length === 0) return new Map();
  const result = await db.execute(sql`
    SELECT section_id, learner_count
    FROM sol_section_learner_counts(${asUuidArray(sectionIds)})
  `);
  return new Map(
    rowsFromExecute<{ section_id: string; learner_count: number }>(result).map(
      (r) => [r.section_id, Number(r.learner_count ?? 0)],
    ),
  );
}

export async function fetchQuizIdsForSections(sectionIds: string[]) {
  if (sectionIds.length === 0) return [] as Array<{ quizId: string; sectionId: string }>;
  const result = await db.execute(sql`
    SELECT quiz_id, section_id
    FROM sol_quiz_ids_for_sections(${asUuidArray(sectionIds)})
  `);
  return rowsFromExecute<{ quiz_id: string; section_id: string }>(result).map(
    (r) => ({ quizId: r.quiz_id, sectionId: r.section_id }),
  );
}

export async function fetchQuizzesByIds(quizIds: string[]) {
  if (quizIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT * FROM sol_quizzes_by_ids(${asUuidArray(quizIds)})
  `);
  return rowsFromExecute<{
    id: string;
    title: string;
    is_active: boolean;
    professor_id: string | null;
    tenant_id: string | null;
    offering_id: string | null;
    end_date: Date | string | null;
    description: string | null;
  }>(result).map((r) => ({
    id: r.id,
    title: r.title,
    isActive: r.is_active,
    professorId: r.professor_id,
    tenantId: r.tenant_id,
    offeringId: r.offering_id,
    endDate: asDate(r.end_date),
    description: r.description,
  }));
}

export async function fetchRecentAttemptsForSections(
  sectionIds: string[],
  limit = 5,
) {
  if (sectionIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT * FROM sol_recent_attempts_for_sections(
      ${asUuidArray(sectionIds)},
      ${limit}::int
    )
  `);
  return rowsFromExecute<{
    id: string;
    student_id: string;
    quiz_id: string;
    section_id: string;
    submitted_at: Date | string;
    percentage: number | null;
    score: number | null;
    max_score: number | null;
    student_name: string | null;
    student_email: string;
    quiz_title: string;
    section_name: string;
    course_title: string;
  }>(result).map((r) => ({
    id: r.id,
    studentId: r.student_id,
    quizId: r.quiz_id,
    sectionId: r.section_id,
    submittedAt: asDate(r.submitted_at)!,
    percentage: r.percentage,
    score: r.score,
    maxScore: r.max_score,
    student: {
      id: r.student_id,
      name: r.student_name,
      email: r.student_email,
      firstName: r.student_name?.split(' ')[0] ?? null,
      lastName: r.student_name?.split(' ').slice(1).join(' ') || null,
    },
    quiz: { id: r.quiz_id, title: r.quiz_title },
    section: {
      id: r.section_id,
      name: r.section_name,
      course: { title: r.course_title },
    },
  }));
}

export async function fetchAttemptScoreRowsForSections(sectionIds: string[]) {
  if (sectionIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT * FROM sol_attempt_score_rows_for_sections(${asUuidArray(sectionIds)})
  `);
  return rowsFromExecute<{
    student_id: string;
    quiz_id: string;
    percentage: number | null;
    score: number | null;
    max_score: number | null;
  }>(result).map((r) => ({
    studentId: r.student_id,
    quizId: r.quiz_id,
    percentage: r.percentage,
    score: r.score,
    maxScore: r.max_score,
  }));
}

export async function fetchWorkspaceTeamMembers(workspaceId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_workspace_team_members(${workspaceId}::uuid)
  `);
  return rowsFromExecute<{
    membership_id: string;
    user_id: string;
    role: string;
    status: string;
    created_at: Date | string;
    user_name: string | null;
    user_email: string;
    user_first_name: string | null;
    user_last_name: string | null;
  }>(result).map((r) => ({
    id: r.membership_id,
    workspaceId,
    userId: r.user_id,
    role: r.role,
    status: r.status,
    createdAt: asDate(r.created_at)!,
    user: {
      id: r.user_id,
      email: r.user_email,
      firstName: r.user_first_name,
      lastName: r.user_last_name,
      name: r.user_name,
    },
  }));
}

export async function fetchWorkspacePendingInvites(workspaceId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_workspace_pending_invites(${workspaceId}::uuid)
  `);
  return rowsFromExecute<{
    id: string;
    email: string;
    role: string;
    expires_at: Date | string;
    created_at: Date | string;
    claimed_at: Date | string | null;
  }>(result).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as 'owner' | 'admin' | 'instructor',
    expiresAt: asDate(r.expires_at)!,
    createdAt: asDate(r.created_at)!,
    claimedAt: asDate(r.claimed_at),
  }));
}

export async function fetchUserEnrollmentsDetail(userId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_user_enrollments_detail(${userId}::uuid)
  `);
  return rowsFromExecute<{
    enrollment_id: string;
    section_id: string;
    status: string;
    enrolled_at: Date | string;
    section_name: string;
    section_ends_at: Date | string | null;
    course_id: string;
    course_title: string;
    workspace_id: string | null;
    workspace_name: string | null;
  }>(result).map((r) => ({
    id: r.enrollment_id,
    sectionId: r.section_id,
    status: r.status,
    enrolledAt: asDate(r.enrolled_at)!,
    section: {
      id: r.section_id,
      name: r.section_name,
      endsAt: asDate(r.section_ends_at),
      course: {
        id: r.course_id,
        title: r.course_title,
        workspaceId: r.workspace_id,
      },
    },
    workspace: r.workspace_id
      ? { id: r.workspace_id, name: r.workspace_name }
      : null,
  }));
}

export async function resolveSectionByEnrollmentCode(code: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_resolve_section_by_enrollment_code(${code})
  `);
  const r = rowsFromExecute<{
    section_id: string;
    course_id: string;
    workspace_id: string | null;
    tenant_id: string | null;
    name: string;
    code_kind: string | null;
  }>(result)[0];
  if (!r) return null;
  return {
    sectionId: r.section_id,
    courseId: r.course_id,
    workspaceId: r.workspace_id,
    tenantId: r.tenant_id,
    name: r.name,
    codeKind: r.code_kind as 'student' | 'professor' | null,
  };
}

export async function fetchWorkspaceUsageDaily(
  workspaceId: string,
  limit = 30,
) {
  const result = await db.execute(sql`
    SELECT * FROM sol_workspace_usage_daily(
      ${workspaceId}::uuid,
      ${limit}::int
    )
  `);
  return rowsFromExecute<{
    id: string;
    day: string;
    grade_units: number;
    tutor_units: number;
    embed_units: number;
    updated_at: Date | string | null;
  }>(result).map((r) => ({
    id: r.id,
    day: r.day,
    gradeUnits: r.grade_units,
    tutorUnits: r.tutor_units,
    embedUnits: r.embed_units,
    updatedAt: r.updated_at ? asDate(r.updated_at)! : null,
  }));
}

export async function fetchWorkspaceAuditRows(
  workspaceId: string,
  limit = 50,
) {
  const result = await db.execute(sql`
    SELECT * FROM sol_workspace_audit_rows(
      ${workspaceId}::uuid,
      ${limit}::int
    )
  `);
  return rowsFromExecute<{
    id: string;
    action: string;
    created_at: Date | string;
    actor_user_id: string | null;
    actor_clerk_id: string | null;
    target_type: string | null;
    target_id: string | null;
    metadata: unknown;
  }>(result).map((r) => ({
    id: r.id,
    action: r.action,
    createdAt: asDate(r.created_at)!,
    actorUserId: r.actor_user_id,
    actorClerkId: r.actor_clerk_id,
    targetType: r.target_type,
    targetId: r.target_id,
    metadata: r.metadata,
  }));
}

/** Platform-ops audit trail (SECURITY DEFINER — bypasses FORCE RLS). */
export async function fetchPlatformAuditRows(opts: {
  action?: string | null;
  tenantId?: string | null;
  from?: Date | null;
  to?: Date | null;
  limit?: number;
  offset?: number;
}) {
  const result = await db.execute(sql`
    SELECT * FROM sol_platform_audit_rows(
      ${opts.action?.trim() || null}::text,
      ${opts.tenantId || null}::uuid,
      ${opts.from ?? null}::timestamptz,
      ${opts.to ?? null}::timestamptz,
      ${opts.limit ?? 50}::int,
      ${opts.offset ?? 0}::int
    )
  `);
  return rowsFromExecute<{
    id: string;
    action: string;
    created_at: Date | string;
    actor_user_id: string | null;
    actor_clerk_id: string | null;
    target_type: string | null;
    target_id: string | null;
    tenant_id: string | null;
    metadata: unknown;
  }>(result).map((r) => ({
    id: r.id,
    action: r.action,
    createdAt: asDate(r.created_at)!,
    actorUserId: r.actor_user_id,
    actorClerkId: r.actor_clerk_id,
    targetType: r.target_type,
    targetId: r.target_id,
    tenantId: r.tenant_id,
    metadata: r.metadata,
  }));
}

export async function fetchPlatformAuditCount(opts: {
  action?: string | null;
  tenantId?: string | null;
  from?: Date | null;
  to?: Date | null;
}) {
  const result = await db.execute(sql`
    SELECT sol_platform_audit_count(
      ${opts.action?.trim() || null}::text,
      ${opts.tenantId || null}::uuid,
      ${opts.from ?? null}::timestamptz,
      ${opts.to ?? null}::timestamptz
    ) AS count
  `);
  const row = rowsFromExecute<{ count: number }>(result)[0];
  return Number(row?.count ?? 0);
}

export async function fetchUserSubmittedAttempts(
  userId: string,
  limit = 20,
) {
  const result = await db.execute(sql`
    SELECT * FROM sol_user_submitted_attempts(
      ${userId}::uuid,
      ${limit}::int
    )
  `);
  return rowsFromExecute<{
    id: string;
    quiz_id: string;
    section_id: string;
    submitted_at: Date | string;
    percentage: number | null;
    score: number | null;
    max_score: number | null;
    quiz_title: string;
    section_name: string;
  }>(result).map((r) => ({
    id: r.id,
    quizId: r.quiz_id,
    sectionId: r.section_id,
    submittedAt: asDate(r.submitted_at)!,
    percentage: r.percentage,
    score: r.score,
    maxScore: r.max_score,
    quiz: { id: r.quiz_id, title: r.quiz_title },
    section: { id: r.section_id, name: r.section_name },
  }));
}

export async function fetchLtiPlatformsForWorkspace(workspaceId: string) {
  const result = await db.execute(sql`
    SELECT * FROM sol_lti_platforms_for_workspace(${workspaceId}::uuid)
  `);
  return rowsFromExecute<{
    id: string;
    issuer: string;
    client_id: string;
    auth_login_url: string;
    auth_token_url: string;
    key_set_url: string;
    label: string | null;
    created_at: Date | string;
  }>(result).map((r) => ({
    id: r.id,
    issuer: r.issuer,
    clientId: r.client_id,
    authLoginUrl: r.auth_login_url,
    authTokenUrl: r.auth_token_url,
    keySetUrl: r.key_set_url,
    label: r.label,
    createdAt: asDate(r.created_at)!,
  }));
}
