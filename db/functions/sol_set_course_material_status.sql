-- Live definition of sol_set_course_material_status() (last changed in drizzle/0072_knowledge_job_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_course_material_status(
  p_material_id uuid,
  p_status text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT COALESCE(tenant_id, (
    SELECT COALESCE(c.tenant_id, c.workspace_id) FROM courses c WHERE c.id = m.course_id
  )) INTO v_tenant
  FROM course_materials m WHERE m.id = p_material_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  UPDATE course_materials
  SET status = p_status,
      error_message = NULLIF(p_error, ''),
      updated_at = now()
  WHERE id = p_material_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_set_course_material_status(uuid, text, text) FROM PUBLIC;
