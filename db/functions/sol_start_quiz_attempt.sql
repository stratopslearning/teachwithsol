-- Live definition of sol_start_quiz_attempt() (last changed in drizzle/0073_student_exam_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_start_quiz_attempt(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment uuid := (p_payload->>'assignmentId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_quiz uuid := (p_payload->>'quizId')::uuid;
  v_section uuid := (p_payload->>'sectionId')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_open attempts%ROWTYPE;
  v_new attempts%ROWTYPE;
BEGIN
  IF v_assignment IS NULL OR v_student IS NULL OR v_quiz IS NULL OR v_section IS NULL THEN
    RAISE EXCEPTION 'assignmentId, studentId, quizId, sectionId required';
  END IF;

  SELECT COALESCE(s.tenant_id, s.workspace_id), s.offering_id
  INTO v_tenant, v_offering
  FROM sections s WHERE s.id = v_section;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Section not found';
  END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  PERFORM id FROM assignments WHERE id = v_assignment FOR UPDATE;

  SELECT * INTO v_open
  FROM attempts
  WHERE assignment_id = v_assignment
    AND student_id = v_student
    AND submitted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_open.id,
      'startedAt', v_open.started_at,
      'answers', v_open.answers,
      'resumed', true
    );
  END IF;

  INSERT INTO attempts (
    assignment_id, student_id, quiz_id, section_id, tenant_id, offering_id,
    answers, max_score, started_at
  ) VALUES (
    v_assignment, v_student, v_quiz, v_section, v_tenant, v_offering,
    '{}'::jsonb, 0, now()
  )
  RETURNING * INTO v_new;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'startedAt', v_new.started_at,
    'answers', v_new.answers,
    'resumed', false
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_start_quiz_attempt(jsonb) FROM PUBLIC;
