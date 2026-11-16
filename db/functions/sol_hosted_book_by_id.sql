-- Live definition of sol_hosted_book_by_id() (last changed in drizzle/0091_hosted_books_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_hosted_book_by_id(p_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row hosted_books%ROWTYPE;
BEGIN
  IF p_book_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = p_book_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_row FROM hosted_books WHERE id = p_book_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_hosted_book_by_id(uuid) FROM PUBLIC;
