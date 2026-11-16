-- Live definition of sol_delete_course_material_chunks() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_delete_course_material_chunks(p_material_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_count integer;
BEGIN
  IF p_material_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(m.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM course_materials m
  JOIN courses c ON c.id = m.course_id
  WHERE m.id = p_material_id;
  IF v_tenant IS NULL THEN
    RETURN 0;
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  DELETE FROM course_material_chunks WHERE material_id = p_material_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sol_delete_course_material_chunks(uuid) FROM PUBLIC;
