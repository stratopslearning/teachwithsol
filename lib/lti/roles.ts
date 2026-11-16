/**
 * Map LTI roles (IMS LIS v2 URIs, LTI 1.1 URNs, short names, Canvas
 * enrollment types) → SOL role hints.
 *
 * Only *context* (course-membership) roles count. Institution and system
 * roles (e.g. `institution/person#Instructor`, which Canvas sends for anyone
 * who teaches any course) say nothing about this course and are ignored, so
 * a learner here who teaches elsewhere stays a learner.
 */

export type LtiRoleScope = 'context' | 'institution' | 'system';

export type ParsedLtiRole = { scope: LtiRoleScope; name: string };

const LIS_V2 = 'http://purl.imsglobal.org/vocab/lis/v2/';

/** Parse one role string; null when it isn't a recognisable LTI role. */
export function parseLtiRole(raw: string): ParsedLtiRole | null {
  const role = raw.trim();
  if (!role) return null;

  if (role.startsWith(LIS_V2)) {
    const rest = role.slice(LIS_V2.length);
    const hash = rest.lastIndexOf('#');
    if (hash < 0) return null;
    const name = rest.slice(hash + 1);
    if (rest.startsWith('membership')) return { scope: 'context', name };
    if (rest.startsWith('institution/')) return { scope: 'institution', name };
    if (rest.startsWith('system/')) return { scope: 'system', name };
    return null;
  }

  // LTI 1.1 URNs: urn:lti:role:ims/lis/Instructor[/TeachingAssistant]
  const urn = /^urn:lti:(role|instrole|sysrole):ims\/lis\/(.+)$/.exec(role);
  if (urn) {
    const name = urn[2].split('/').pop() ?? urn[2];
    const scope: LtiRoleScope =
      urn[1] === 'role' ? 'context' : urn[1] === 'instrole' ? 'institution' : 'system';
    return { scope, name };
  }

  // Short names are context roles per the LTI spec (and Canvas enrollment
  // types are course enrollments).
  if (/^[A-Za-z]+$/.test(role)) return { scope: 'context', name: role };

  return null;
}

const TEACHING_CONTEXT_ROLES = new Set([
  'Instructor',
  'TeachingAssistant',
  'ContentDeveloper',
  'Administrator',
  'TeacherEnrollment',
  'TaEnrollment',
  'DesignerEnrollment',
]);

const TA_CONTEXT_ROLES = new Set(['TeachingAssistant', 'TaEnrollment']);

function contextRoleNames(roles: string[] | undefined | null): string[] {
  return (roles ?? [])
    .map(parseLtiRole)
    .filter((r): r is ParsedLtiRole => r?.scope === 'context')
    .map((r) => r.name);
}

export type LtiSolRoleHint = 'PROFESSOR' | 'STUDENT';

export function mapLtiRolesToSolHint(
  roles: string[] | undefined | null,
): LtiSolRoleHint {
  return contextRoleNames(roles).some((n) => TEACHING_CONTEXT_ROLES.has(n))
    ? 'PROFESSOR'
    : 'STUDENT';
}

/** True when the course-membership roles include a TA role. */
export function hasTeachingAssistantRole(
  roles: string[] | undefined | null,
): boolean {
  return contextRoleNames(roles).some((n) => TA_CONTEXT_ROLES.has(n));
}

export function isInstructorRoleHint(hint: LtiSolRoleHint): boolean {
  return hint === 'PROFESSOR';
}
