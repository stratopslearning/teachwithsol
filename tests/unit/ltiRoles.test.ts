import { describe, expect, it } from 'vitest';

import {
  hasTeachingAssistantRole,
  mapLtiRolesToSolHint,
  parseLtiRole,
} from '@/lib/lti/roles';

describe('mapLtiRolesToSolHint', () => {
  it('maps instructor URI to PROFESSOR', () => {
    expect(
      mapLtiRolesToSolHint([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
      ]),
    ).toBe('PROFESSOR');
  });

  it('maps teaching assistant to PROFESSOR', () => {
    expect(
      mapLtiRolesToSolHint([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#TeachingAssistant',
      ]),
    ).toBe('PROFESSOR');
  });

  it('maps learner to STUDENT', () => {
    expect(
      mapLtiRolesToSolHint([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      ]),
    ).toBe('STUDENT');
  });

  it('defaults ambiguous roles to STUDENT', () => {
    expect(mapLtiRolesToSolHint([])).toBe('STUDENT');
    expect(mapLtiRolesToSolHint(['urn:custom:observer'])).toBe('STUDENT');
  });
});

describe('LTI roles: only course-membership roles count', () => {
  const V2 = 'http://purl.imsglobal.org/vocab/lis/v2/';

  it('ignores institution Instructor for a course learner (Canvas)', () => {
    expect(
      mapLtiRolesToSolHint([
        `${V2}institution/person#Instructor`,
        `${V2}membership#Learner`,
      ]),
    ).toBe('STUDENT');
  });

  it('ignores institution and system roles on their own', () => {
    expect(
      mapLtiRolesToSolHint([
        `${V2}institution/person#Administrator`,
        `${V2}institution/person#Faculty`,
        `${V2}system/person#Administrator`,
      ]),
    ).toBe('STUDENT');
  });

  it('treats a sub-role under membership as a course role', () => {
    const roles = [`${V2}membership/Instructor#TeachingAssistant`];
    expect(mapLtiRolesToSolHint(roles)).toBe('PROFESSOR');
    expect(hasTeachingAssistantRole(roles)).toBe(true);
  });

  it('handles LTI 1.1 URNs by scope', () => {
    expect(mapLtiRolesToSolHint(['urn:lti:role:ims/lis/Instructor'])).toBe('PROFESSOR');
    expect(mapLtiRolesToSolHint(['urn:lti:instrole:ims/lis/Instructor'])).toBe('STUDENT');
  });

  it('accepts short names and Canvas enrollment types', () => {
    expect(mapLtiRolesToSolHint(['Instructor'])).toBe('PROFESSOR');
    expect(mapLtiRolesToSolHint(['TeacherEnrollment'])).toBe('PROFESSOR');
    expect(mapLtiRolesToSolHint(['StudentEnrollment'])).toBe('STUDENT');
    expect(hasTeachingAssistantRole(['TaEnrollment'])).toBe(true);
  });

  it('does not match role names by substring', () => {
    expect(mapLtiRolesToSolHint(['NotAnInstructor'])).toBe('STUDENT');
    expect(hasTeachingAssistantRole([`${V2}institution/person#TeachingAssistant`])).toBe(false);
  });

  it('parses scopes', () => {
    expect(parseLtiRole(`${V2}membership#Mentor`)).toEqual({ scope: 'context', name: 'Mentor' });
    expect(parseLtiRole(`${V2}institution/person#Staff`)).toEqual({ scope: 'institution', name: 'Staff' });
    expect(parseLtiRole('urn:custom:observer')).toBeNull();
  });
});
