-- Live definition of sol_admin_purge_course_material() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_purge_course_material(p_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row course_materials%ROWTYPE;
BEGIN
  IF p_material_id IS NULL THEN RAISE EXCEPTION 'materialId required'; END IF;
  SELECT COALESCE(m.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM course_materials m
  JOIN courses c ON c.id = m.course_id
  WHERE m.id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_row FROM course_materials WHERE id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;

  DELETE FROM course_material_chunks WHERE material_id = p_material_id;
  DELETE FROM course_materials WHERE id = p_material_id;

  RETURN jsonb_build_object(
    's3Key', v_row.s3_key,
    'courseId', v_row.course_id,
    'title', v_row.title,
    'tenantId', COALESCE(v_row.tenant_id, v_tenant)
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_admin_purge_course_material(uuid) FROM PUBLIC;
