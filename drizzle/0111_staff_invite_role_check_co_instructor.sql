-- 0110 widened sol_create_staff_invite validation; the table CHECK still
-- only allowed ta|grader. Allow co_instructor on section_staff_invites.role.

ALTER TABLE section_staff_invites
  DROP CONSTRAINT IF EXISTS section_staff_invites_role_check;
--> statement-breakpoint
ALTER TABLE section_staff_invites
  ADD CONSTRAINT section_staff_invites_role_check
  CHECK (role = ANY (ARRAY['ta'::text, 'grader'::text, 'co_instructor'::text]));
