-- Live definition of sol_book_linked_material_ids() (last changed in drizzle/0094_course_material_by_id_definer.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_book_linked_material_ids(p_course_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_ids uuid[];
BEGIN
  SELECT COALESCE(c.tenant_id, c.workspace_id) INTO v_tenant
  FROM courses c WHERE c.id = p_course_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  SELECT COALESCE(array_agg(DISTINCT bc.material_id), ARRAY[]::uuid[])
  INTO v_ids
  FROM book_chapters bc
  WHERE bc.course_id = p_course_id
    AND bc.deleted_at IS NULL
    AND bc.material_id IS NOT NULL;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_book_linked_material_ids(uuid) FROM PUBLIC;
