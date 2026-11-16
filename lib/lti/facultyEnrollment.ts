/**
 * Dual-write LTI faculty into professor_sections (metadata) + role_bindings
 * (authority). Never uses users.role.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/app/db';
import { professorSections, roleBindings, sections } from '@/app/db/schema';
import { clearBindingCache } from '@/lib/authz/authorize';
import { upsertRoleBinding } from '@/lib/authz/bindings';
import type { BindingRole } from '@/lib/authz/permissions';
import { hasTeachingAssistantRole } from '@/lib/lti/roles';
import { ensureWorkspaceMembership } from '@/lib/workspace/access';
import { SECTION_TEACHING_ROLES } from '@/app/db/enums';


/** Map Canvas/IMS roles → section-scoped binding. Default co_instructor. */
export function mapLtiRolesToBindingRole(
  roles: string[] | undefined | null,
): BindingRole {
  return hasTeachingAssistantRole(roles) ? 'ta' : 'co_instructor';
}

async function resolveSectionTenantId(
  sectionId: string,
): Promise<string | null> {
  const section = await db.query.sections.findFirst({
    where: eq(sections.id, sectionId),
    columns: { tenantId: true, workspaceId: true, courseId: true },
  });
  if (!section) return null;
  if (section.tenantId) return section.tenantId;
  if (section.workspaceId) return section.workspaceId;
  const { getCourseWorkspaceId } = await import('@/lib/workspace/access');
  return getCourseWorkspaceId(section.courseId);
}

/** Activate professor_sections row + seat + section teaching binding. */
export async function upsertLtiFacultyOnSection(opts: {
  userId: string;
  sectionId: string;
  ltiRoles?: string[] | null;
  grantedBy?: string | null;
}): Promise<void> {
  const tenantId = await resolveSectionTenantId(opts.sectionId);
  if (!tenantId) {
    throw new Error(`Section ${opts.sectionId} has no tenant`);
  }

  await db
    .insert(professorSections)
    .values({
      professorId: opts.userId,
      sectionId: opts.sectionId,
      status: 'ACTIVE',
      tenantId,
    })
    .onConflictDoUpdate({
      target: [professorSections.professorId, professorSections.sectionId],
      set: { status: 'ACTIVE' },
    });

  await ensureWorkspaceMembership({
    workspaceId: tenantId,
    userId: opts.userId,
  });

  await upsertRoleBinding({
    tenantId,
    userId: opts.userId,
    scopeType: 'section',
    scopeId: opts.sectionId,
    role: mapLtiRolesToBindingRole(opts.ltiRoles),
    grantedBy: opts.grantedBy ?? null,
  });
}

/** Soft-drop LTI faculty metadata and revoke section teaching bindings. */
export async function deactivateLtiFacultyOnSection(opts: {
  userId: string;
  sectionId: string;
}): Promise<void> {
  await db
    .update(professorSections)
    .set({ status: 'INACTIVE' })
    .where(
      and(
        eq(professorSections.sectionId, opts.sectionId),
        eq(professorSections.professorId, opts.userId),
      ),
    );

  await revokeSectionTeachingBindings(opts.userId, opts.sectionId);
}

/** Revoke all section-scoped teaching bindings for a user (leave / LTI drop). */
export async function revokeSectionTeachingBindings(
  userId: string,
  sectionId: string,
): Promise<void> {
  const tenantId = await resolveSectionTenantId(sectionId);
  const rows = await db.query.roleBindings.findMany({
    where: and(
      eq(roleBindings.userId, userId),
      eq(roleBindings.scopeType, 'section'),
      eq(roleBindings.scopeId, sectionId),
      inArray(roleBindings.role, SECTION_TEACHING_ROLES),
      isNull(roleBindings.revokedAt),
    ),
    columns: { id: true, tenantId: true },
  });
  if (rows.length === 0) return;
  const now = new Date();
  await db
    .update(roleBindings)
    .set({ revokedAt: now })
    .where(
      inArray(
        roleBindings.id,
        rows.map((r) => r.id),
      ),
    );
  clearBindingCache(userId, tenantId ?? rows[0]?.tenantId);
}
