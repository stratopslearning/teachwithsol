import { ApiError } from '@/lib/api/errors';
import { authorize, userHasAnyBinding } from '@/lib/authz/authorize';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { TEACHING_ROLES } from '@/lib/authz/permissions';
import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import { fetchActiveSectionIdsForStudentDefiner } from '@/lib/db/bookWriteDefiners';
import { fetchInteractiveSectionIdsDefiner } from '@/lib/db/facultyWriteDefiners';
import { fetchInteractiveByIdDefiner } from '@/lib/db/studentReadDefiners';
import type { AuthUserRef as AuthUser } from '@/lib/getOrCreateUser';

async function userCanWriteInteractive(
  user: AuthUser,
  interactive: {
    id: string;
    professorId: string | null;
    tenantId?: string | null;
    offeringId?: string | null;
  },
): Promise<boolean> {
  if (interactive.tenantId && interactive.offeringId) {
    if (
      await authorize(user, 'content.write', {
        tenantId: interactive.tenantId,
        scopeType: 'offering',
        scopeId: interactive.offeringId,
      })
    ) {
      return true;
    }
  }

  const links = await fetchInteractiveSectionIdsDefiner(interactive.id);
  for (const sectionId of links) {
    if (await authorizeOnSection(user, 'content.write', sectionId)) {
      return true;
    }
  }

  // Authorship is metadata: it only counts with a teaching binding in the
  // interactive's tenant. tenant_id is NOT NULL in the DB (0039); a row without
  // one is treated as unowned rather than open to its author.
  const authorId = interactive.professorId;
  if (authorId && authorId === user.id && interactive.tenantId) {
    return userHasAnyBinding(user.id, interactive.tenantId, TEACHING_ROLES);
  }

  return false;
}

export async function assertCanManageInteractive(
  user: AuthUser,
  interactiveId: string,
) {
  const interactive = await fetchInteractiveByIdDefiner(interactiveId);
  if (!interactive) {
    throw ApiError.notFound('Interactive not found');
  }
  if (!(await userCanWriteInteractive(user, interactive))) {
    throw ApiError.forbidden('You do not manage this interactive');
  }
  return interactive;
}

export async function assertStudentCanAccessInteractive(
  user: AuthUser,
  interactiveId: string,
) {
  const interactive = await fetchInteractiveByIdDefiner(interactiveId);
  if (!interactive || !interactive.isActive) {
    throw ApiError.notFound('Interactive not found');
  }

  const sectionIds = await fetchActiveSectionIdsForStudentDefiner(user.id);
  if (sectionIds.length === 0) {
    throw ApiError.forbidden('Not enrolled');
  }
  const assigned = await fetchInteractiveSectionIdsDefiner(interactiveId);
  const enrolled = new Set(sectionIds);
  const ok = assigned.some((id) => enrolled.has(id));
  if (!ok) throw ApiError.forbidden('Not assigned to your sections');
  return interactive;
}

export async function listTeachableSectionsForCourse(
  user: AuthUser,
  courseId: string,
): Promise<string[]> {
  return listTeachableSectionIdsForCourse(user, courseId);
}
