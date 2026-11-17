-- Live definition of sol_section_copy_quiz() (last changed in drizzle/0117_quiz_hide_feedback_column.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_section_copy_quiz(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source uuid := (p_payload->>'sourceQuizId')::uuid;
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_section_ids uuid[] := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb))::uuid),
    ARRAY[]::uuid[]
  );
  v_src quizzes%ROWTYPE;
  v_new uuid;
  v_title text;
  v_q questions%ROWTYPE;
BEGIN
  IF v_source IS NULL OR v_professor IS NULL OR cardinality(v_section_ids) = 0 THEN
    RAISE EXCEPTION 'sourceQuizId, professorId, sectionIds required';
  END IF;

  SELECT * INTO v_src FROM quizzes WHERE id = v_source AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz not found'; END IF;
  IF v_src.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_src.tenant_id::text, true);
  END IF;

  v_title := v_src.title;
  INSERT INTO quizzes (
    title, description, professor_id, tenant_id, offering_id,
    max_attempts, time_limit, passing_score, start_date, end_date, is_active,
    hide_feedback_after_due
  ) VALUES (
    v_title, v_src.description, v_professor, v_src.tenant_id, v_src.offering_id,
    v_src.max_attempts, v_src.time_limit, v_src.passing_score,
    v_src.start_date, v_src.end_date, v_src.is_active, v_src.hide_feedback_after_due
  )
  RETURNING id INTO v_new;

  FOR v_q IN SELECT * FROM questions WHERE quiz_id = v_source
  LOOP
    INSERT INTO questions (
      quiz_id, tenant_id, offering_id, type, question, options,
      correct_answer, points, "order", concept_tags, rubric, rubric_status
    ) VALUES (
      v_new, v_src.tenant_id, v_src.offering_id, v_q.type, v_q.question, v_q.options,
      v_q.correct_answer, v_q.points, v_q."order", v_q.concept_tags, v_q.rubric, v_q.rubric_status
    );
  END LOOP;

  INSERT INTO quiz_sections (quiz_id, section_id, assigned_by, tenant_id)
  SELECT v_new, sid, v_professor, v_src.tenant_id
  FROM unnest(v_section_ids) AS sid;

  UPDATE attempts
  SET quiz_id = v_new
  WHERE quiz_id = v_source AND section_id = ANY(v_section_ids);

  UPDATE assignments a
  SET quiz_id = v_new
  WHERE a.quiz_id = v_source
    AND a.student_id IN (
      SELECT ss.student_id FROM student_sections ss
      WHERE ss.section_id = ANY(v_section_ids) AND ss.status = 'ACTIVE'
    );

  DELETE FROM quiz_sections
  WHERE quiz_id = v_source AND section_id = ANY(v_section_ids);

  RETURN jsonb_build_object(
    'id', v_new,
    'title', v_title,
    'sectionIds', to_jsonb(v_section_ids)
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_section_copy_quiz(jsonb) FROM PUBLIC;
