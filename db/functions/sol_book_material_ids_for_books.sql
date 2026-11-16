-- Live definition of sol_book_material_ids_for_books() (last changed in drizzle/0096_force_rls_audit_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_book_material_ids_for_books(p_book_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_book_ids IS NULL OR cardinality(p_book_ids) = 0 THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT COALESCE(array_agg(DISTINCT bc.material_id), ARRAY[]::uuid[])
  INTO v_ids
  FROM book_chapters bc
  WHERE bc.book_id = ANY(p_book_ids)
    AND bc.deleted_at IS NULL
    AND bc.material_id IS NOT NULL;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION sol_book_material_ids_for_books(uuid[]) FROM PUBLIC;
