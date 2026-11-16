-- Live definition of sol_soft_delete_book_chapters() (last changed in drizzle/0091_hosted_books_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_soft_delete_book_chapters(p_book_id uuid)
RETURNS void
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
  IF NOT FOUND OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'Book not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE book_chapters
  SET deleted_at = now(), updated_at = now()
  WHERE book_id = p_book_id AND deleted_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION sol_soft_delete_book_chapters(uuid) FROM PUBLIC;
