/**
 * Professor section reads, shared by the dashboard, the REST API, and MCP
 * tools. Mirrors the SSR logic of `/dashboard/professor/sections`.
 */
import { ApiError } from '@/lib/api/errors';
import { authorize, tenantIdForSection } from '@/lib/authz';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import { fetchSectionLearnerCounts } from '@/lib/db/facultyStudentReads';
import { listTeachingSectionIds } from '@/lib/professor/graderSections';
import type { UserData } from '@/lib/getOrCreateUser';
import { partitionEnrollmentsByConclusion } from '@/lib/sections/availability';
import {
  loadSectionDetailData,
  type SectionDetailData,
} from '@/lib/sections/detailData';

export type ProfessorSectionSummary = {
  id: string;
  name: string;
  course: { id: string; title: string } | null;
  learnerCount: number;
  endsAt: Date | null;
  archived: boolean;
  enrolledAt: Date;
};

type ProfessorUser = Pick<UserData, 'id'> & {
  platformStaff?: boolean | null;
}

/**
 * Sections the user teaches, derived from role_bindings (DEFINER expansion).
 */
export async function listProfessorSections(
  user: ProfessorUser,
): Promise<{ active: ProfessorSectionSummary[]; archived: ProfessorSectionSummary[] }> {
  const sectionIds = await listTeachingSectionIds(user);
  if (sectionIds.length === 0) return { active: [], archived: [] };

  const [sectionRows, learnerCounts] = await Promise.all([
    fetchSectionsByIds(sectionIds),
    fetchSectionLearnerCounts(sectionIds),
  ]);

  const rows = sectionRows.map((section) => ({
    section: {
      id: section.id,
      name: section.name,
      endsAt: section.endsAt,
      createdAt: new Date(),
      course: section.course,
    },
    enrolledAt: new Date(),
  }));

  const { active, archived } = partitionEnrollmentsByConclusion(rows);

  const toSummary = (
    e: (typeof rows)[number],
    isArchived: boolean,
  ): ProfessorSectionSummary => ({
    id: e.section.id,
    name: e.section.name,
    course: e.section.course
      ? { id: e.section.course.id, title: e.section.course.title }
      : null,
    learnerCount: learnerCounts.get(e.section.id) ?? 0,
    endsAt: e.section.endsAt ?? null,
    archived: isArchived,
    enrolledAt: e.enrolledAt,
  });

  return {
    active: active.map((e) => toSummary(e, false)),
    archived: archived.map((e) => toSummary(e, true)),
  };
}

/** View section desk (content.read). Org faculty can pass. */
export async function assertCanViewSection(
  user: ProfessorUser,
  sectionId: string,
): Promise<void> {
  const tenantId = await tenantIdForSection(sectionId);
  if (!tenantId) throw ApiError.notFound('Section not found');
  const allowed = await authorize(user, 'content.read', {
    tenantId,
    scopeType: 'section',
    scopeId: sectionId,
  });
  if (!allowed) {
    throw ApiError.forbidden('You do not teach this section');
  }
}

/** Grade / desk ops that require grade.write (not org-only faculty). */
export async function assertCanGradeSection(
  user: ProfessorUser,
  sectionId: string,
): Promise<void> {
  const tenantId = await tenantIdForSection(sectionId);
  if (!tenantId) throw ApiError.notFound('Section not found');
  const allowed = await authorize(user, 'grade.write', {
    tenantId,
    scopeType: 'section',
    scopeId: sectionId,
  });
  if (!allowed) {
    throw ApiError.forbidden('You cannot grade this section');
  }
}

/**
 * @deprecated Prefer assertCanViewSection / assertCanGradeSection.
 * Kept for call sites that need "teaches" ≈ content.read OR grade.write.
 * New roster/staff gates should use roster.manage / staff.manage directly.
 */
export async function assertTeachesSection(
  user: ProfessorUser,
  sectionId: string,
): Promise<void> {
  const tenantId = await tenantIdForSection(sectionId);
  if (!tenantId) throw ApiError.notFound('Section not found');
  const canGrade = await authorize(user, 'grade.write', {
    tenantId,
    scopeType: 'section',
    scopeId: sectionId,
  });
  if (canGrade) return;
  const canRead = await authorize(user, 'content.read', {
    tenantId,
    scopeType: 'section',
    scopeId: sectionId,
  });
  if (!canRead) {
    throw ApiError.forbidden('You do not teach this section');
  }
}

export async function getProfessorSectionDetail(
  user: ProfessorUser,
  sectionId: string,
): Promise<SectionDetailData> {
  await assertCanViewSection(user, sectionId);
  const detail = await loadSectionDetailData(sectionId);
  if (!detail) throw ApiError.notFound('Section not found');
  return detail;
}
