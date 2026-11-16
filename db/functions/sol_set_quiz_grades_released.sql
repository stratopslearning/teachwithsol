-- Live definition of sol_set_quiz_grades_released() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_quiz_grades_released(
  p_quiz_id uuid,
  p_released_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_id uuid;
  v_released timestamptz;
BEGIN
  SELECT tenant_id INTO v_tenant FROM quizzes WHERE id = p_quiz_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  UPDATE quizzes
  SET grades_released_at = p_released_at, updated_at = now()
  WHERE id = p_quiz_id
  RETURNING id, grades_released_at INTO v_id, v_released;
  RETURN jsonb_build_object('id', v_id, 'gradesReleasedAt', v_released);
END;
$$;
REVOKE ALL ON FUNCTION sol_set_quiz_grades_released(uuid, timestamptz) FROM PUBLIC;
