-- Live definition of sol_unassign_quiz_section() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_unassign_quiz_section(
  p_section_id uuid,
  p_quiz_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT COALESCE(s.tenant_id, s.workspace_id) INTO v_tenant
  FROM sections s WHERE s.id = p_section_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  DELETE FROM quiz_sections
  WHERE section_id = p_section_id AND quiz_id = p_quiz_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_unassign_quiz_section(uuid, uuid) FROM PUBLIC;
