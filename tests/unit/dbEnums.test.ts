import { describe, expect, it } from 'vitest';

import {
  BINDING_ROLES,
  LICENSE_PLANS,
  licensePlanForWorkspaceType,
  QUESTION_TYPES,
  SECTION_TEACHING_ROLES,
  WORKSPACE_TYPES,
} from '@/app/db/enums';
import { questions, roleBindings, workspaceLicenses, workspaces } from '@/app/db/schema';

describe('app/db/enums', () => {
  it('maps every workspace type to a license plan', () => {
    for (const t of WORKSPACE_TYPES) {
      expect(LICENSE_PLANS).toContain(licensePlanForWorkspaceType(t));
    }
    expect(licensePlanForWorkspaceType('business')).toBe('business_team');
    expect(licensePlanForWorkspaceType('department')).toBe('department');
  });

  it('section teaching roles are binding roles', () => {
    for (const r of SECTION_TEACHING_ROLES) expect(BINDING_ROLES).toContain(r);
  });

  it('the schema columns use the shared tuples', () => {
    expect(workspaces.type.enumValues).toEqual([...WORKSPACE_TYPES]);
    expect(workspaceLicenses.plan.enumValues).toEqual([...LICENSE_PLANS]);
    expect(roleBindings.role.enumValues).toEqual([...BINDING_ROLES]);
    expect(questions.type.enumValues).toEqual([...QUESTION_TYPES]);
  });
});
