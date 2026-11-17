/**
 * Platform-ops cross-tenant DEFINER reads (drizzle/0054_admin_platform_reads.sql).
 * Call only after requireAdmin() / platform_staff gates.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { asDate, rowsFromExecute } from '@/lib/db/rows';

export async function fetchAdminOverviewStats() {
  const result = await db.execute(sql`SELECT * FROM sol_admin_overview_stats()`);
  const r = rowsFromExecute<{
    workspace_count: number;
    pending_invite_count: number;
    unpaid_license_count: number;
    course_count: number;
    ongoing_section_count: number;
  }>(result)[0];
  return {
    workspaceCount: Number(r?.workspace_count ?? 0),
    pendingInviteCount: Number(r?.pending_invite_count ?? 0),
    unpaidLicenseCount: Number(r?.unpaid_license_count ?? 0),
    courseCount: Number(r?.course_count ?? 0),
    ongoingSectionCount: Number(r?.ongoing_section_count ?? 0),
  };
}

export async function fetchAdminWorkspaceDirectory() {
  const result = await db.execute(
    sql`SELECT * FROM sol_admin_workspace_directory()`,
  );
  return rowsFromExecute<{
    id: string;
    slug: string;
    name: string;
    type: string;
    status: string;
    parent_workspace_id: string | null;
    created_at: Date | string;
    seat_cap: number | null;
    license_plan: string | null;
    license_status: string | null;
    billing_provider: string | null;
    license_period_end: Date | string | null;
    stripe_subscription_id: string | null;
    owner_email: string | null;
    claim_status: string;
    course_count: number;
    open_invite_count: number;
    child_count: number;
  }>(result).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type,
    status: r.status,
    parentWorkspaceId: r.parent_workspace_id,
    createdAt: asDate(r.created_at)!,
    seatCap: r.seat_cap,
    licensePlan: r.license_plan,
    licenseStatus: r.license_status,
    billingProvider: r.billing_provider,
    licensePeriodEnd: asDate(r.license_period_end),
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
    ownerEmail: r.owner_email,
    claimStatus: r.claim_status as 'claimed' | 'pending' | 'expired' | 'none',
    courseCount: Number(r.course_count ?? 0),
    openInviteCount: Number(r.open_invite_count ?? 0),
    childCount: Number(r.child_count ?? 0),
  }));
}

export async function fetchAdminCoursesAll() {
  const result = await db.execute(sql`SELECT * FROM sol_admin_courses_all()`);
  return rowsFromExecute<{
    id: string;
    workspace_id: string;
    tenant_id: string;
    title: string;
    description: string | null;
    status: string;
    created_at: Date | string;
    updated_at: Date | string;
    section_count: number;
  }>(result).map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    tenantId: r.tenant_id,
    title: r.title,
    description: r.description,
    status: r.status,
    createdAt: asDate(r.created_at)!,
    updatedAt: asDate(r.updated_at)!,
    sectionCount: Number(r.section_count ?? 0),
    sections: [] as Array<{ id: string; name: string }>,
  }));
}

export async function fetchAdminSectionsAll() {
  const result = await db.execute(sql`SELECT * FROM sol_admin_sections_all()`);
  return rowsFromExecute<{
    id: string;
    course_id: string;
    offering_id: string | null;
    workspace_id: string | null;
    tenant_id: string | null;
    name: string;
    professor_enrollment_code: string;
    student_enrollment_code: string;
    is_active: boolean;
    ends_at: Date | string | null;
    deleted_at: Date | string | null;
    created_at: Date | string;
    course_title: string;
    workspace_name: string | null;
    learner_count: number;
    faculty_count: number;
  }>(result).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    offeringId: r.offering_id,
    workspaceId: r.workspace_id,
    tenantId: r.tenant_id,
    name: r.name,
    professorEnrollmentCode: r.professor_enrollment_code,
    studentEnrollmentCode: r.student_enrollment_code,
    isActive: r.is_active,
    endsAt: asDate(r.ends_at),
    deletedAt: asDate(r.deleted_at),
    createdAt: asDate(r.created_at)!,
    course: { id: r.course_id, title: r.course_title },
    workspaceName: r.workspace_name,
    learnerCount: Number(r.learner_count ?? 0),
    facultyCount: Number(r.faculty_count ?? 0),
  }));
}

/** All users (the users table is not tenant-scoped). */
export async function listAllUsers() {
  return db.query.users.findMany();
}

/** User totals for the admin overview, without loading every row. */
export async function countUsers(): Promise<{ total: number; platformStaff: number }> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE platform_staff)::int AS platform_staff
    FROM users
  `);
  const row = rowsFromExecute<{ total: number; platform_staff: number }>(result)[0];
  return { total: Number(row?.total ?? 0), platformStaff: Number(row?.platform_staff ?? 0) };
}
