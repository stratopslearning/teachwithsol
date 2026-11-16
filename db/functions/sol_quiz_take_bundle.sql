-- Live definition of sol_quiz_take_bundle() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_quiz_take_bundle(
  p_quiz_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz quizzes%ROWTYPE;
  v_section_ids uuid[];
  v_resolved uuid;
  v_section sections%ROWTYPE;
  v_assignment jsonb;
  v_questions jsonb;
  v_open attempts%ROWTYPE;
BEGIN
  IF p_quiz_id IS NULL OR p_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_quiz
  FROM quizzes
  WHERE id = p_quiz_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_quiz.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_quiz.tenant_id::text, true);
  END IF;

  SELECT COALESCE(array_agg(qs.section_id), ARRAY[]::uuid[])
  INTO v_section_ids
  FROM quiz_sections qs
  WHERE qs.quiz_id = p_quiz_id;

  v_resolved := sol_resolve_attempt_section(p_student_id, v_section_ids, NULL);

  IF v_resolved IS NOT NULL THEN
    SELECT * INTO v_section FROM sections WHERE id = v_resolved;
  END IF;

  v_assignment := sol_ensure_quiz_assignment(
    p_quiz_id,
    p_student_id,
    now() + interval '7 days'
  );

  v_questions := sol_quiz_questions_safe(p_quiz_id);

  SELECT * INTO v_open
  FROM attempts
  WHERE quiz_id = p_quiz_id
    AND student_id = p_student_id
    AND submitted_at IS NULL
  LIMIT 1;

  RETURN jsonb_build_object(
    'quiz', to_jsonb(v_quiz),
    'quizSectionIds', to_jsonb(v_section_ids),
    'resolvedSectionId', v_resolved,
    'section', CASE WHEN v_section.id IS NULL THEN NULL ELSE to_jsonb(v_section) END,
    'assignment', v_assignment,
    'questions', v_questions,
    'inProgressAttempt', CASE WHEN v_open.id IS NULL THEN NULL ELSE to_jsonb(v_open) END
  );
END;
$$;
