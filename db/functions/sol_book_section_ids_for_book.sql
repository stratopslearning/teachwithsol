-- Live definition of sol_book_section_ids_for_book() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_book_section_ids_for_book(p_book_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_ids uuid[];
BEGIN
  IF p_book_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT COALESCE(hb.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM hosted_books hb
  JOIN courses c ON c.id = hb.course_id
  WHERE hb.id = p_book_id;
  IF v_tenant IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT COALESCE(array_agg(bs.section_id), ARRAY[]::uuid[])
  INTO v_ids
  FROM book_sections bs
  WHERE bs.book_id = p_book_id;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_book_section_ids_for_book(uuid) FROM PUBLIC;
