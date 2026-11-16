-- Live definition of sol_attempt_with_quiz_assignment() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_attempt_with_quiz_assignment(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt attempts%ROWTYPE;
  v_quiz quizzes%ROWTYPE;
  v_assignment assignments%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_attempt FROM attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_attempt.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_attempt.tenant_id::text, true);
  END IF;

  SELECT * INTO v_quiz FROM quizzes WHERE id = v_attempt.quiz_id;
  SELECT * INTO v_assignment FROM assignments WHERE id = v_attempt.assignment_id;

  RETURN jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'quiz', CASE WHEN v_quiz.id IS NULL THEN NULL ELSE to_jsonb(v_quiz) END,
    'assignment', CASE WHEN v_assignment.id IS NULL THEN NULL ELSE to_jsonb(v_assignment) END
  );
END;
$$;
