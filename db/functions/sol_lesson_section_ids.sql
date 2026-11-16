-- Live definition of sol_lesson_section_ids() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_lesson_section_ids(p_lesson_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_ids uuid[];
BEGIN
  IF p_lesson_id IS NULL THEN RETURN ARRAY[]::uuid[]; END IF;
  SELECT COALESCE(l.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM lessons l JOIN courses c ON c.id = l.course_id
  WHERE l.id = p_lesson_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT COALESCE(array_agg(section_id), ARRAY[]::uuid[])
  INTO v_ids FROM lesson_sections WHERE lesson_id = p_lesson_id;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_lesson_section_ids(uuid) FROM PUBLIC;
