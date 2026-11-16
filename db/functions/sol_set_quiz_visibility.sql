-- Live definition of sol_set_quiz_visibility() (last changed in drizzle/0066_quiz_visibility_definer.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_quiz_visibility(
  p_quiz_id uuid,
  p_is_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found uuid;
BEGIN
  IF p_quiz_id IS NULL THEN
    RAISE EXCEPTION 'quizId required';
  END IF;

  UPDATE quizzes
  SET
    is_active = COALESCE(p_is_active, is_active),
    deleted_at = CASE
      WHEN COALESCE(p_is_active, false) THEN NULL
      ELSE deleted_at
    END,
    updated_at = now()
  WHERE id = p_quiz_id
    AND deleted_at IS NULL
  RETURNING id INTO v_found;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Quiz not found: %', p_quiz_id;
  END IF;

  UPDATE course_activities
  SET
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE quiz_id = p_quiz_id
    AND deleted_at IS NULL;

  RETURN v_found;
END;
$$;
REVOKE ALL ON FUNCTION sol_set_quiz_visibility(uuid, boolean) FROM PUBLIC;
