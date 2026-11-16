-- Live definition of sol_load_exam_context() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_load_exam_context(
  p_quiz_id uuid,
  p_assignment_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_assignment assignments%ROWTYPE;
  v_quiz quizzes%ROWTYPE;
  v_open attempts%ROWTYPE;
  v_submitted int;
  v_sections jsonb;
BEGIN
  IF p_quiz_id IS NULL OR p_assignment_id IS NULL OR p_student_id IS NULL THEN
    RETURN jsonb_build_object(
      'assignment', NULL,
      'quiz', NULL,
      'inProgressAttempt', NULL,
      'submittedCount', 0,
      'quizSectionLinks', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_assignment
  FROM assignments
  WHERE id = p_assignment_id
    AND quiz_id = p_quiz_id
    AND student_id = p_student_id;

  SELECT * INTO v_quiz
  FROM quizzes
  WHERE id = p_quiz_id AND deleted_at IS NULL;

  IF v_assignment.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_assignment.tenant_id::text, true);
  ELSIF v_quiz.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_quiz.tenant_id::text, true);
  END IF;

  IF v_assignment.id IS NULL OR v_quiz.id IS NULL THEN
    RETURN jsonb_build_object(
      'assignment', CASE WHEN v_assignment.id IS NULL THEN NULL ELSE to_jsonb(v_assignment) END,
      'quiz', CASE WHEN v_quiz.id IS NULL THEN NULL ELSE to_jsonb(v_quiz) END,
      'inProgressAttempt', NULL,
      'submittedCount', 0,
      'quizSectionLinks', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_open
  FROM attempts
  WHERE assignment_id = p_assignment_id
    AND student_id = p_student_id
    AND submitted_at IS NULL
  LIMIT 1;

  SELECT count(*)::int INTO v_submitted
  FROM attempts
  WHERE assignment_id = p_assignment_id
    AND student_id = p_student_id
    AND submitted_at IS NOT NULL;

  SELECT COALESCE(jsonb_agg(to_jsonb(qs) ORDER BY qs.section_id), '[]'::jsonb)
  INTO v_sections
  FROM quiz_sections qs
  WHERE qs.quiz_id = p_quiz_id;

  RETURN jsonb_build_object(
    'assignment', to_jsonb(v_assignment),
    'quiz', to_jsonb(v_quiz),
    'inProgressAttempt', CASE WHEN v_open.id IS NULL THEN NULL ELSE to_jsonb(v_open) END,
    'submittedCount', v_submitted,
    'quizSectionLinks', v_sections
  );
END;
$$;
