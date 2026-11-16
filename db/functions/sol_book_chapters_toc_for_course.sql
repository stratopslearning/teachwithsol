-- Live definition of sol_book_chapters_toc_for_course() (last changed in drizzle/0091_hosted_books_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_book_chapters_toc_for_course(p_course_id uuid)
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
  FROM courses c
  WHERE c.id = p_course_id AND c.deleted_at IS NULL;
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
          'partTitle', bc.part_title,
          'parentId', bc.parent_id,
          'level', bc.level
        )
        ORDER BY bc.position ASC
      )
      FROM book_chapters bc
      WHERE bc.course_id = p_course_id AND bc.deleted_at IS NULL
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_book_chapters_toc_for_course(uuid) FROM PUBLIC;
