-- Live definition of sol_soft_delete_course_materials() (last changed in drizzle/0092_book_rag_material_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_soft_delete_course_materials(p_material_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mid uuid;
  v_tenant uuid;
  v_count int := 0;
BEGIN
  IF p_material_ids IS NULL OR array_length(p_material_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH v_mid IN ARRAY p_material_ids
  LOOP
    SELECT COALESCE(m.tenant_id, c.tenant_id, c.workspace_id)
    INTO v_tenant
    FROM course_materials m
    JOIN courses c ON c.id = m.course_id
    WHERE m.id = v_mid;
    IF v_tenant IS NOT NULL THEN
      PERFORM set_config('app.tenant_id', v_tenant::text, true);
    END IF;

    UPDATE course_materials
    SET deleted_at = now(), updated_at = now()
    WHERE id = v_mid AND deleted_at IS NULL;
    IF FOUND THEN v_count := v_count + 1; END IF;

    UPDATE course_material_chunks
    SET deleted_at = now()
    WHERE material_id = v_mid AND deleted_at IS NULL;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sol_soft_delete_course_materials(uuid[]) FROM PUBLIC;
