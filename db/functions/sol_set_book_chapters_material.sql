-- Live definition of sol_set_book_chapters_material() (last changed in drizzle/0092_book_rag_material_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_book_chapters_material(
  p_book_id uuid,
  p_material_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_count int;
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

  UPDATE book_chapters
  SET material_id = p_material_id, updated_at = now()
  WHERE book_id = p_book_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sol_set_book_chapters_material(uuid, uuid) FROM PUBLIC;
