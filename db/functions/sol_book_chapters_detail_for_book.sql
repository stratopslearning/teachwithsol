-- Live definition of sol_book_chapters_detail_for_book() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_book_chapters_detail_for_book(p_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_book_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = p_book_id;
  IF v_tenant IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', bc.id,
          'bookId', bc.book_id,
          'position', bc.position,
          'title', bc.title,
          'slug', bc.slug,
          'partTitle', bc.part_title,
          'parentId', bc.parent_id,
          'level', bc.level,
          'sourceUrl', bc.source_url,
          'materialId', bc.material_id,
          'markdownLength', char_length(bc.markdown)
        )
        ORDER BY bc.position ASC
      )
      FROM book_chapters bc
      WHERE bc.book_id = p_book_id AND bc.deleted_at IS NULL
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_book_chapters_detail_for_book(uuid) FROM PUBLIC;
