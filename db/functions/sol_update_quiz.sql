-- Live definition of sol_update_quiz() (last changed in drizzle/0117_quiz_hide_feedback_column.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_quiz(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz_id uuid := (p_payload->>'quizId')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_q jsonb;
  v_section uuid;
  v_order int := 0;
  v_existing_ids uuid[] := ARRAY[]::uuid[];
  v_keep_ids uuid[] := ARRAY[]::uuid[];
  v_qid uuid;
BEGIN
  IF v_quiz_id IS NULL THEN
    RAISE EXCEPTION 'quizId required';
  END IF;

  SELECT tenant_id, offering_id INTO v_tenant, v_offering
  FROM quizzes
  WHERE id = v_quiz_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found: %', v_quiz_id;
  END IF;

  UPDATE quizzes
  SET
    title = COALESCE(NULLIF(trim(p_payload->>'title'), ''), title),
    description = NULLIF(p_payload->>'description', ''),
    max_attempts = COALESCE((p_payload->>'maxAttempts')::int, max_attempts),
    time_limit = NULLIF(p_payload->>'timeLimit', '')::int,
    passing_score = COALESCE((p_payload->>'passingScore')::int, passing_score),
    start_date = NULLIF(p_payload->>'startDate', '')::timestamptz,
    end_date = NULLIF(p_payload->>'endDate', '')::timestamptz,
    is_active = COALESCE((p_payload->>'isActive')::boolean, is_active),
    hide_feedback_after_due = COALESCE(
      (p_payload->>'hideFeedbackAfterDue')::boolean,
      hide_feedback_after_due
    ),
    updated_at = now()
  WHERE id = v_quiz_id;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_existing_ids
  FROM questions
  WHERE quiz_id = v_quiz_id;

  FOR v_q IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'questions', '[]'::jsonb))
  LOOP
    v_qid := NULLIF(v_q->>'id', '')::uuid;
    IF v_qid IS NOT NULL AND v_qid = ANY (v_existing_ids) THEN
      UPDATE questions
      SET
        type = COALESCE(v_q->>'type', type),
        question = COALESCE(v_q->>'question', question),
        options = COALESCE(v_q->'options', options),
        correct_answer = NULLIF(v_q->>'correctAnswer', ''),
        points = COALESCE((v_q->>'points')::int, points),
        "order" = COALESCE((v_q->>'order')::int, v_order),
        concept_tags = COALESCE(v_q->'conceptTags', concept_tags)
      WHERE id = v_qid;
      v_keep_ids := array_append(v_keep_ids, v_qid);
    ELSE
      INSERT INTO questions (
        quiz_id, tenant_id, offering_id, type, question, options,
        correct_answer, points, "order", concept_tags
      ) VALUES (
        v_quiz_id,
        v_tenant,
        v_offering,
        COALESCE(v_q->>'type', 'MULTIPLE_CHOICE'),
        COALESCE(v_q->>'question', ''),
        v_q->'options',
        NULLIF(v_q->>'correctAnswer', ''),
        COALESCE((v_q->>'points')::int, 1),
        COALESCE((v_q->>'order')::int, v_order),
        COALESCE(v_q->'conceptTags', '[]'::jsonb)
      )
      RETURNING id INTO v_qid;
      v_keep_ids := array_append(v_keep_ids, v_qid);
    END IF;
    v_order := v_order + 1;
  END LOOP;

  IF COALESCE(jsonb_array_length(p_payload->'questions'), 0) > 0 THEN
    DELETE FROM questions
    WHERE quiz_id = v_quiz_id
      AND NOT (id = ANY (v_keep_ids));
  END IF;

  IF p_payload ? 'sectionIds' THEN
    DELETE FROM quiz_sections WHERE quiz_id = v_quiz_id;
    FOR v_section IN
      SELECT (jsonb_array_elements_text(p_payload->'sectionIds'))::uuid
    LOOP
      INSERT INTO quiz_sections (
        quiz_id, section_id, tenant_id, offering_id, assigned_by
      ) VALUES (
        v_quiz_id,
        v_section,
        v_tenant,
        v_offering,
        NULLIF(p_payload->>'assignedBy', '')::uuid
      );
    END LOOP;
  END IF;

  UPDATE course_activities
  SET
    title = COALESCE(NULLIF(trim(p_payload->>'title'), ''), title),
    description = NULLIF(p_payload->>'description', ''),
    start_date = NULLIF(p_payload->>'startDate', '')::timestamptz,
    end_date = NULLIF(p_payload->>'endDate', '')::timestamptz,
    is_active = COALESCE((p_payload->>'isActive')::boolean, is_active),
    tenant_id = COALESCE(tenant_id, v_tenant),
    updated_at = now()
  WHERE quiz_id = v_quiz_id
    AND deleted_at IS NULL;

  RETURN v_quiz_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_update_quiz(jsonb) FROM PUBLIC;
