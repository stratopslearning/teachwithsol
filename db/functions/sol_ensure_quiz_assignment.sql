-- Live definition of sol_ensure_quiz_assignment() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_ensure_quiz_assignment(
  p_quiz_id uuid,
  p_student_id uuid,
  p_due_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_offering uuid;
  v_row assignments%ROWTYPE;
BEGIN
  IF p_quiz_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'quizId and studentId required';
  END IF;

  SELECT q.tenant_id, q.offering_id INTO v_tenant, v_offering
  FROM quizzes q WHERE q.id = p_quiz_id AND q.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_row
  FROM assignments
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id;

  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  INSERT INTO assignments (
    quiz_id, student_id, tenant_id, offering_id, due_date
  ) VALUES (
    p_quiz_id,
    p_student_id,
    v_tenant,
    v_offering,
    COALESCE(p_due_date, now() + interval '7 days')
  )
  ON CONFLICT (quiz_id, student_id) DO NOTHING;

  SELECT * INTO v_row
  FROM assignments
  WHERE quiz_id = p_quiz_id AND student_id = p_student_id;

  RETURN to_jsonb(v_row);
END;
$$;
