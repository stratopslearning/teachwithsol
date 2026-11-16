-- Live definition of sol_archive_quiz() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_archive_quiz(p_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM quizzes WHERE id = p_quiz_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE quizzes
  SET is_active = false, deleted_at = now(), updated_at = now()
  WHERE id = p_quiz_id;

  RETURN p_quiz_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_archive_quiz(uuid) FROM PUBLIC;
