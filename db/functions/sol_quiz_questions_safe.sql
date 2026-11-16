-- Live definition of sol_quiz_questions_safe() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_quiz_questions_safe(p_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF p_quiz_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT tenant_id INTO v_tenant FROM quizzes WHERE id = p_quiz_id;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'quiz_id', q.quiz_id,
          'tenant_id', q.tenant_id,
          'offering_id', q.offering_id,
          'type', q.type,
          'question', q.question,
          'options', q.options,
          'correct_answer', NULL,
          'points', q.points,
          'order', q.order,
          'rubric', NULL,
          'rubric_version', q.rubric_version,
          'rubric_status', q.rubric_status,
          'concept_tags', q.concept_tags,
          'created_at', q.created_at
        )
        ORDER BY q.order
      )
      FROM questions q
      WHERE q.quiz_id = p_quiz_id
    ),
    '[]'::jsonb
  );
END;
$$;
