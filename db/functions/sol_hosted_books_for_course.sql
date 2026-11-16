-- Live definition of sol_hosted_books_for_course() (last changed in drizzle/0091_hosted_books_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_hosted_books_for_course(p_course_id uuid)
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
      SELECT jsonb_agg(to_jsonb(hb) ORDER BY hb.created_at DESC)
      FROM hosted_books hb
      WHERE hb.course_id = p_course_id AND hb.deleted_at IS NULL
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_hosted_books_for_course(uuid) FROM PUBLIC;
