-- Live definition of sol_soft_delete_book_chapters_by_ids() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_soft_delete_book_chapters_by_ids(
  p_book_id uuid,
  p_chapter_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_count integer;
BEGIN
  IF p_book_id IS NULL OR p_chapter_ids IS NULL OR cardinality(p_chapter_ids) = 0 THEN
    RETURN 0;
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
  SET deleted_at = now(), updated_at = now()
  WHERE book_id = p_book_id
    AND id = ANY(p_chapter_ids)
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION sol_soft_delete_book_chapters_by_ids(uuid, uuid[]) FROM PUBLIC;
