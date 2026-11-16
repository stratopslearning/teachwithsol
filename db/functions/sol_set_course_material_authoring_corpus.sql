-- Live definition of sol_set_course_material_authoring_corpus() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_course_material_authoring_corpus(
  p_material_id uuid,
  p_corpus text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row course_materials%ROWTYPE;
BEGIN
  IF p_material_id IS NULL OR p_corpus IS NULL THEN
    RAISE EXCEPTION 'materialId and corpus required';
  END IF;
  IF p_corpus NOT IN ('prior_course', 'this_term') THEN
    RAISE EXCEPTION 'Invalid authoring corpus';
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
  SET authoring_corpus = p_corpus, updated_at = now()
  WHERE id = p_material_id AND deleted_at IS NULL
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_set_course_material_authoring_corpus(uuid, text) FROM PUBLIC;
