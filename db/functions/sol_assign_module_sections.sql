-- Live definition of sol_assign_module_sections() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_assign_module_sections(p_module_id uuid, p_section_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_sid uuid;
  v_count int := 0;
BEGIN
  SELECT tenant_id INTO v_tenant FROM course_modules WHERE id = p_module_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RETURN 0; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  FOREACH v_sid IN ARRAY coalesce(p_section_ids, ARRAY[]::uuid[]) LOOP
    INSERT INTO module_sections (module_id, section_id, tenant_id)
    VALUES (p_module_id, v_sid, v_tenant)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
