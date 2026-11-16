-- Live definition of sol_book_chapters_for_rag() (last changed in drizzle/0092_book_rag_material_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_book_chapters_for_rag(p_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_book_id IS NULL THEN
    RAISE EXCEPTION 'bookId required';
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = p_book_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Book not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', bc.id,
          'title', bc.title,
          'partTitle', bc.part_title,
          'markdown', bc.markdown,
          'materialId', bc.material_id,
          'position', bc.position
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
REVOKE ALL ON FUNCTION sol_book_chapters_for_rag(uuid) FROM PUBLIC;
