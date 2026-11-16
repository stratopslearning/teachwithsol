/**
 * Professor join-code API stays thin; co_instructor binding lives in mutations.
 * Staff email invites may grant co_instructor | ta | grader.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { SECTION_STAFF_INVITE_ROLES } from '@/app/db/enums';

describe('wf.enroll.coInstructor.contract', () => {
  it('professor enroll route does not bind co_instructor inline', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/professor/enroll/route.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/co_instructor/);
  });

  it('staff invite path allows co_instructor alongside ta/grader', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/authz/staffInvites.ts'),
      'utf8',
    );
    expect(src).toMatch(/co_instructor/);
    expect(src).toMatch(/'ta'/);
    expect(src).toMatch(/'grader'/);
  });

  it('staff API accepts co_instructor role', () => {
    // The route validates `role` with z.enum(SECTION_STAFF_INVITE_ROLES).
    expect([...SECTION_STAFF_INVITE_ROLES]).toEqual(['co_instructor', 'ta', 'grader']);
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        'app/api/professor/section/[sectionId]/staff/route.ts',
      ),
      'utf8',
    );
    expect(src).toMatch(/z\.enum\(SECTION_STAFF_INVITE_ROLES\)/);
    expect(src).toMatch(/fetchSectionById/);
  });
});
