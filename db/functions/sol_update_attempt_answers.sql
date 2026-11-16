-- Live definition of sol_update_attempt_answers() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_attempt_answers(
  p_attempt_id uuid,
  p_student_id uuid,
  p_answers jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_attempt_id IS NULL OR p_student_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(a.tenant_id, q.tenant_id) INTO v_tenant
  FROM attempts a
  JOIN quizzes q ON q.id = a.quiz_id
  WHERE a.id = p_attempt_id
    AND a.student_id = p_student_id
    AND a.submitted_at IS NULL;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE attempts
  SET answers = COALESCE(p_answers, answers)
  WHERE id = p_attempt_id
    AND student_id = p_student_id
    AND submitted_at IS NULL;

  RETURN FOUND;
END;
$$;
