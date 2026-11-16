-- Live definition of sol_course_material_chunk_count() (last changed in drizzle/0098_authoring_chunks_include_books.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_course_material_chunk_count(p_material_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_count int;
BEGIN
  IF p_material_id IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(m.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM course_materials m
  JOIN courses c ON c.id = m.course_id
  WHERE m.id = p_material_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT count(*)::int INTO v_count
  FROM course_material_chunks
  WHERE material_id = p_material_id AND deleted_at IS NULL;
  RETURN COALESCE(v_count, 0);
END;
$$;
REVOKE ALL ON FUNCTION sol_course_material_chunk_count(uuid) FROM PUBLIC;
