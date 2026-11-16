import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/app/db';
import { ltiUserLinks, professorSections, studentSections } from '@/app/db/schema';
import {
  applyEnrollmentSourceRemoval,
  upsertStudentEnrollment,
} from '@/lib/enrollment/sources';
import { logAudit } from '@/lib/audit';
import type { LtiToolConfig } from '@/lib/lti/config';
import type { SectionLinkRow } from '@/lib/lti/links';
import { getPlatformForSectionLink } from '@/lib/lti/links';
import {
  deactivateLtiFacultyOnSection,
  upsertLtiFacultyOnSection,
} from '@/lib/lti/facultyEnrollment';
import {
  mapLtiRolesToSolHint,
  type LtiSolRoleHint,
} from '@/lib/lti/roles';
import { getLtiConfig } from '@/lib/lti/config';
import { getPlatformAccessToken, NRPS_SCOPES } from '@/lib/lti/tokens';
import { resolveOrCreateLtiUser } from '@/lib/lti/users';

type NrpsMember = {
  status?: string;
  user_id?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  roles?: string[];
};

type NrpsResponse = {
  members?: NrpsMember[];
};

export type RosterSyncResult = {
  sectionId: string;
  fetched: number;
  studentsActive: number;
  professorsActive: number;
  dropped: number;
};

async function fetchMemberships(
  config: LtiToolConfig,
  membershipsUrl: string,
): Promise<NrpsMember[]> {
  const token = await getPlatformAccessToken(config, NRPS_SCOPES);
  const members: NrpsMember[] = [];
  let url: string | null = membershipsUrl;

  while (url) {
    const currentUrl: string = url;
    const res: Response = await fetch(currentUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `NRPS fetch failed (${res.status}): ${text.slice(0, 400)}`,
      );
    }
    const json = (await res.json()) as NrpsResponse;
    for (const m of json.members ?? []) members.push(m);

    const linkHeader: string | null = res.headers.get('link');
    const nextMatch: RegExpMatchArray | null =
      linkHeader?.match(/<([^>]+)>;\s*rel="next"/i) ?? null;
    url = nextMatch?.[1] ?? null;
  }

  return members;
}

function memberActive(member: NrpsMember): boolean {
  const status = (member.status ?? 'Active').toLowerCase();
  return status === 'active';
}

/**
 * Pull Canvas roster via NRPS and upsert SOL enrollments.
 * Faculty get role_bindings (authority) + professor_sections (metadata).
 * Does not delete attempts; drops set status DROPPED / INACTIVE.
 */
export async function syncRosterForSectionLink(
  link: SectionLinkRow,
  opts?: { actorUserId?: string | null; actorClerkId?: string | null },
): Promise<RosterSyncResult> {
  const cfg = getLtiConfig();
  if (!cfg.enabled) {
    throw new Error('LTI is not enabled');
  }
  if (!link.nrpsMembershipsUrl) {
    throw new Error(
      'NRPS memberships URL not available yet. Launch SOL from Canvas once to activate roster sync.',
    );
  }

  const platformMeta = await getPlatformForSectionLink(link);
  if (!platformMeta) throw new Error('LTI platform missing for section link');

  const members = await fetchMemberships(cfg, link.nrpsMembershipsUrl);
  const activeStudentIds = new Set<string>();
  const activeProfessorIds = new Set<string>();

  for (const member of members) {
    if (!member.user_id || !memberActive(member)) continue;
    const hint: LtiSolRoleHint = mapLtiRolesToSolHint(member.roles);
    const { user } = await resolveOrCreateLtiUser({
      platformId: platformMeta.platform.id,
      tenantId: platformMeta.platform.tenantId ?? platformMeta.platform.workspaceId,
      ltiUserId: member.user_id,
      email: member.email,
      claims: {
        name: member.name,
        given_name: member.given_name,
        family_name: member.family_name,
      },
      roles: member.roles ?? [],
    });

    if (hint === 'PROFESSOR') {
      activeProfessorIds.add(user.id);
      await upsertLtiFacultyOnSection({
        userId: user.id,
        sectionId: link.sectionId,
        ltiRoles: member.roles,
        grantedBy: opts?.actorUserId ?? null,
      });
    } else {
      activeStudentIds.add(user.id);
      await upsertStudentEnrollment({
        studentId: user.id,
        sectionId: link.sectionId,
        source: 'lti',
        bestEffortOfferingSync: true,
      });
    }
  }

  const existingStudents = await db.query.studentSections.findMany({
    where: and(
      eq(studentSections.sectionId, link.sectionId),
      eq(studentSections.status, 'ACTIVE'),
    ),
  });
  const dropStudentIds = existingStudents
    .map((e) => e.studentId)
    .filter((id) => !activeStudentIds.has(id));

  // Only drop students who have an LTI user link (Canvas-sourced). Code-enrolled
  // students without LTI links are left alone.
  let dropped = 0;
  if (dropStudentIds.length > 0) {
    const linked = await db.query.ltiUserLinks.findMany({
      where: and(
        eq(ltiUserLinks.platformId, platformMeta.platform.id),
        inArray(ltiUserLinks.userId, dropStudentIds),
      ),
    });
    const linkedUserIds = new Set(linked.map((l) => l.userId));
    const toDrop = dropStudentIds.filter((id) => linkedUserIds.has(id));
    for (const studentId of toDrop) {
      const outcome = await applyEnrollmentSourceRemoval({
        studentId,
        sectionId: link.sectionId,
        source: 'lti',
      });
      if (outcome === 'dropped') dropped += 1;
    }
  }

  const existingFaculty = await db.query.professorSections.findMany({
    where: and(
      eq(professorSections.sectionId, link.sectionId),
      eq(professorSections.status, 'ACTIVE'),
    ),
  });
  const dropFacultyIds = existingFaculty
    .map((e) => e.professorId)
    .filter((id) => !activeProfessorIds.has(id));
  if (dropFacultyIds.length > 0) {
    const linked = await db.query.ltiUserLinks.findMany({
      where: and(
        eq(ltiUserLinks.platformId, platformMeta.platform.id),
        inArray(ltiUserLinks.userId, dropFacultyIds),
      ),
    });
    const linkedUserIds = new Set(linked.map((l) => l.userId));
    const toDrop = dropFacultyIds.filter((id) => linkedUserIds.has(id));
    for (const professorId of toDrop) {
      await deactivateLtiFacultyOnSection({
        userId: professorId,
        sectionId: link.sectionId,
      });
      dropped += 1;
    }
  }

  const result: RosterSyncResult = {
    sectionId: link.sectionId,
    fetched: members.length,
    studentsActive: activeStudentIds.size,
    professorsActive: activeProfessorIds.size,
    dropped,
  };

  await logAudit({
    actorUserId: opts?.actorUserId ?? null,
    actorClerkId: opts?.actorClerkId ?? null,
    action: 'lti.roster.sync',
    targetType: 'section',
    targetId: link.sectionId,
    metadata: result,
  });

  return result;
}

export async function syncAllLinkedRosters(): Promise<RosterSyncResult[]> {
  const links = await db.query.ltiSectionLinks.findMany();
  const results: RosterSyncResult[] = [];
  for (const link of links) {
    if (!link.nrpsMembershipsUrl) continue;
    try {
      results.push(await syncRosterForSectionLink(link));
    } catch (err) {
      console.error('LTI roster sync failed for section', link.sectionId, err);
      results.push({
        sectionId: link.sectionId,
        fetched: 0,
        studentsActive: 0,
        professorsActive: 0,
        dropped: 0,
      });
    }
  }
  return results;
}

/**
 * Ensure the launching user is enrolled in the linked section.
 * Uses LTI role hint only — never users.role.
 */
export async function ensureLaunchEnrollment(opts: {
  sectionId: string;
  userId: string;
  roleHint: LtiSolRoleHint;
  ltiRoles?: string[] | null;
}): Promise<void> {
  if (opts.roleHint === 'PROFESSOR') {
    await upsertLtiFacultyOnSection({
      userId: opts.userId,
      sectionId: opts.sectionId,
      ltiRoles: opts.ltiRoles ?? ['Instructor'],
    });
    return;
  }

  await upsertStudentEnrollment({
    studentId: opts.userId,
    sectionId: opts.sectionId,
    source: 'lti',
    bestEffortOfferingSync: true,
  });
}
