-- Live definition of sol_book_chapter_for_reader() (last changed in drizzle/0095_faculty_book_reader_release.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_book_chapter_for_reader(p_chapter_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row book_chapters%ROWTYPE;
BEGIN
  IF p_chapter_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(bc.tenant_id, hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM book_chapters bc
  JOIN hosted_books hb ON hb.id = bc.book_id
  JOIN courses c ON c.id = hb.course_id
  WHERE bc.id = p_chapter_id;

  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_row
  FROM book_chapters
  WHERE id = p_chapter_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_book_chapter_for_reader(uuid) FROM PUBLIC;
