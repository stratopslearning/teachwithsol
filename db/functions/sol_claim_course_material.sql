-- Live definition of sol_claim_course_material() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_claim_course_material(p_material_id uuid)
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
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE course_materials
  SET status = 'PROCESSING', error_message = NULL, updated_at = now()
  WHERE id = p_material_id
    AND deleted_at IS NULL
    AND status = 'PENDING'
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_claim_course_material(uuid) FROM PUBLIC;
