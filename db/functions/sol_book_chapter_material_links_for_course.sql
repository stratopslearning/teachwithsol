-- Live definition of sol_book_chapter_material_links_for_course() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_book_chapter_material_links_for_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_course_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT COALESCE(c.tenant_id, c.workspace_id) INTO v_tenant
  FROM courses c WHERE c.id = p_course_id;
  IF v_tenant IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'materialId', bc.material_id,
          'deletedAt', bc.deleted_at
        )
      )
      FROM book_chapters bc
      WHERE bc.course_id = p_course_id
        AND bc.material_id IS NOT NULL
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_book_chapter_material_links_for_course(uuid) FROM PUBLIC;
