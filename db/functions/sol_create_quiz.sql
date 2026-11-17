-- Live definition of sol_create_quiz() (last changed in drizzle/0117_quiz_hide_feedback_column.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_quiz(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := (p_payload->>'tenantId')::uuid;
  v_offering uuid := NULLIF(p_payload->>'offeringId', '')::uuid;
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_course uuid := NULLIF(p_payload->>'courseId', '')::uuid;
  v_quiz uuid;
  v_q jsonb;
  v_section uuid;
  v_order int := 0;
BEGIN
  IF v_tenant IS NULL OR v_professor IS NULL THEN
    RAISE EXCEPTION 'tenantId and professorId required';
  END IF;
  IF COALESCE(jsonb_array_length(p_payload->'sectionIds'), 0) = 0 THEN
    RAISE EXCEPTION 'sectionIds required';
  END IF;

  INSERT INTO quizzes (
    title,
    description,
    professor_id,
    tenant_id,
    offering_id,
    max_attempts,
    time_limit,
    passing_score,
    start_date,
    end_date,
    is_active,
    source_outline_item_id,
    hide_feedback_after_due
  ) VALUES (
    COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled quiz'),
    NULLIF(p_payload->>'description', ''),
    v_professor,
    v_tenant,
    v_offering,
    COALESCE((p_payload->>'maxAttempts')::int, 1),
    NULLIF(p_payload->>'timeLimit', '')::int,
    COALESCE((p_payload->>'passingScore')::int, 60),
    NULLIF(p_payload->>'startDate', '')::timestamptz,
    NULLIF(p_payload->>'endDate', '')::timestamptz,
    COALESCE((p_payload->>'isActive')::boolean, true),
    NULLIF(p_payload->>'sourceOutlineItemId', '')::uuid,
    COALESCE((p_payload->>'hideFeedbackAfterDue')::boolean, false)
  )
  RETURNING id INTO v_quiz;

  FOR v_q IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'questions', '[]'::jsonb))
  LOOP
    INSERT INTO questions (
      quiz_id,
      tenant_id,
      offering_id,
      type,
      question,
      options,
      correct_answer,
      points,
      "order",
      concept_tags,
      rubric,
      rubric_status,
      rubric_approved_at
    ) VALUES (
      v_quiz,
      v_tenant,
      v_offering,
      COALESCE(v_q->>'type', 'MULTIPLE_CHOICE'),
      COALESCE(v_q->>'question', ''),
      v_q->'options',
      NULLIF(v_q->>'correctAnswer', ''),
      COALESCE((v_q->>'points')::int, 1),
      COALESCE((v_q->>'order')::int, v_order),
      COALESCE(v_q->'conceptTags', '[]'::jsonb),
      v_q->'rubric',
      COALESCE(NULLIF(v_q->>'rubricStatus', ''), 'none'),
      CASE
        WHEN v_q->'rubric' IS NOT NULL
          AND jsonb_typeof(v_q->'rubric') = 'array'
          AND jsonb_array_length(v_q->'rubric') > 0
        THEN now()
        ELSE NULL
      END
    );
    v_order := v_order + 1;
  END LOOP;

  FOR v_section IN
    SELECT (jsonb_array_elements_text(p_payload->'sectionIds'))::uuid
  LOOP
    INSERT INTO quiz_sections (
      quiz_id,
      section_id,
      tenant_id,
      offering_id,
      assigned_by
    ) VALUES (
      v_quiz,
      v_section,
      v_tenant,
      v_offering,
      v_professor
    );
  END LOOP;

  IF v_course IS NOT NULL THEN
    INSERT INTO course_activities (
      course_id,
      tenant_id,
      professor_id,
      type,
      title,
      description,
      quiz_id,
      start_date,
      end_date,
      is_active,
      source_outline_item_id,
      position
    ) VALUES (
      v_course,
      v_tenant,
      v_professor,
      'QUIZ',
      COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled quiz'),
      NULLIF(p_payload->>'description', ''),
      v_quiz,
      NULLIF(p_payload->>'startDate', '')::timestamptz,
      NULLIF(p_payload->>'endDate', '')::timestamptz,
      COALESCE((p_payload->>'isActive')::boolean, true),
      NULLIF(p_payload->>'sourceOutlineItemId', '')::uuid,
      0
    )
    ;
  END IF;

  RETURN v_quiz;
END;
$$;
REVOKE ALL ON FUNCTION sol_create_quiz(jsonb) FROM PUBLIC;
