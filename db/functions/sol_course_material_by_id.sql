-- Live definition of sol_course_material_by_id() (last changed in drizzle/0094_course_material_by_id_definer.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_course_material_by_id(p_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row course_materials%ROWTYPE;
BEGIN
  IF p_material_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(m.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM course_materials m
  JOIN courses c ON c.id = m.course_id
  WHERE m.id = p_material_id;

  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_row FROM course_materials WHERE id = p_material_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_course_material_by_id(uuid) FROM PUBLIC;
