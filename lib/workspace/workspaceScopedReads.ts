/**
 * Workspace-scoped course/section reads that work as sol_app under FORCE RLS
 * without app.tenant_id. Backed by drizzle/0051_workspace_courses_read.sql.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { asUuidArray } from '@/lib/db/sqlArrays';
import { asDate, rowsFromExecute } from '@/lib/db/rows';

type CourseRow = {
  id: string;
  workspace_id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type SectionRow = {
  id: string;
  course_id: string;
  name: string;
  professor_enrollment_code: string;
  student_enrollment_code: string;
  is_active: boolean;
  created_at: Date | string;
};

export async function fetchWorkspaceCoursesWithSections(workspaceId: string) {
  const [courseResult, sectionResult] = await Promise.all([
    db.execute(sql`
      SELECT * FROM sol_workspace_courses(${workspaceId}::uuid)
    `),
    db.execute(sql`
      SELECT * FROM sol_workspace_sections(${workspaceId}::uuid)
    `),
  ]);

  const sectionsByCourse = new Map<string, ReturnType<typeof mapSection>[]>();
  for (const s of rowsFromExecute<SectionRow>(sectionResult)) {
    const mapped = mapSection(s);
    const list = sectionsByCourse.get(s.course_id) ?? [];
    list.push(mapped);
    sectionsByCourse.set(s.course_id, list);
  }

  return rowsFromExecute<CourseRow>(courseResult).map((c) => ({
    id: c.id,
    workspaceId: c.workspace_id,
    tenantId: c.tenant_id,
    title: c.title,
    description: c.description,
    status: c.status as 'ACTIVE' | 'INACTIVE',
    createdAt: asDate(c.created_at),
    updatedAt: asDate(c.updated_at),
    sections: sectionsByCourse.get(c.id) ?? [],
  }));
}

function mapSection(s: SectionRow) {
  return {
    id: s.id,
    courseId: s.course_id,
    name: s.name,
    professorEnrollmentCode: s.professor_enrollment_code,
    studentEnrollmentCode: s.student_enrollment_code,
    isActive: s.is_active,
    createdAt: asDate(s.created_at),
  };
}

export async function fetchWorkspaceActiveLearnerCount(
  workspaceId: string,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT sol_workspace_active_learner_count(${workspaceId}::uuid) AS n
  `);
  const row = rowsFromExecute<{ n: number }>(result)[0];
  return Number(row?.n ?? 0);
}

export async function fetchCourseIdsForTenants(
  tenantIds: string[],
): Promise<Array<{ id: string; workspaceId: string }>> {
  if (tenantIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT id, workspace_id
    FROM sol_courses_for_tenants(${asUuidArray(tenantIds)})
  `);
  return rowsFromExecute<{ id: string; workspace_id: string }>(result).map(
    (r) => ({ id: r.id, workspaceId: r.workspace_id }),
  );
}

export async function fetchOfferingCourseId(
  offeringId: string,
): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT sol_offering_course_id(${offeringId}::uuid) AS course_id
  `);
  return rowsFromExecute<{ course_id: string | null }>(result)[0]?.course_id ?? null;
}

export async function fetchSectionCourseId(
  sectionId: string,
): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT sol_section_course_id(${sectionId}::uuid) AS course_id
  `);
  return rowsFromExecute<{ course_id: string | null }>(result)[0]?.course_id ?? null;
}

export async function fetchCoursesByIds(
  courseIds: string[],
): Promise<Array<{ id: string; title: string; sectionCount: number }>> {
  if (courseIds.length === 0) return [];
  const result = await db.execute(sql`
    SELECT id, title, section_count
    FROM sol_courses_by_ids(${asUuidArray(courseIds)})
  `);
  return rowsFromExecute<{
    id: string;
    title: string;
    section_count: number;
  }>(result).map((r) => ({
    id: r.id,
    title: r.title,
    sectionCount: Number(r.section_count ?? 0),
  }));
}
