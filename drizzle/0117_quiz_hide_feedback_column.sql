-- "Hide feedback until due" was stored as an HTML comment marker inside
-- quizzes.description. It becomes a real column; the marker is backfilled
-- into it and stripped from descriptions. The quiz write functions below
-- read / copy the column instead of carrying the marker in the text.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS hide_feedback_after_due boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE quizzes
SET hide_feedback_after_due = true
WHERE description ~ 'QUIZ_METADATA:\s*\{[^}]*"hideFeedbackAfterDue"\s*:\s*true';
--> statement-breakpoint
UPDATE quizzes
SET description = NULLIF(
  btrim(regexp_replace(description, '\n*<!--\s*QUIZ_METADATA:\s*\{[^}]*\}\s*-->', '', 'g'), E' \n\t'),
  ''
)
WHERE description LIKE '%QUIZ_METADATA%';
--> statement-breakpoint
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_create_quiz(jsonb) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_duplicate_quiz(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source uuid := (p_payload->>'sourceQuizId')::uuid;
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_title text := NULLIF(trim(p_payload->>'title'), '');
  v_section_ids uuid[] := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb))::uuid),
    ARRAY[]::uuid[]
  );
  v_src quizzes%ROWTYPE;
  v_new uuid;
  v_q questions%ROWTYPE;
BEGIN
  SELECT * INTO v_src FROM quizzes WHERE id = v_source AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz not found';
  END IF;
  IF v_src.tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_src.tenant_id::text, true);
  END IF;

  INSERT INTO quizzes (
    title, description, professor_id, tenant_id, offering_id,
    max_attempts, time_limit, passing_score, start_date, end_date, is_active,
    hide_feedback_after_due
  ) VALUES (
    COALESCE(v_title, v_src.title || ' (Copy)'),
    v_src.description,
    v_professor,
    v_src.tenant_id,
    v_src.offering_id,
    v_src.max_attempts,
    v_src.time_limit,
    v_src.passing_score,
    v_src.start_date,
    v_src.end_date,
    false,
    v_src.hide_feedback_after_due
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

  IF array_length(v_section_ids, 1) IS NOT NULL THEN
    INSERT INTO quiz_sections (quiz_id, section_id, assigned_by, tenant_id)
    SELECT v_new, sid, v_professor, v_src.tenant_id
    FROM unnest(v_section_ids) AS sid;
  END IF;

  RETURN jsonb_build_object('id', v_new, 'title', COALESCE(v_title, v_src.title || ' (Copy)'));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_duplicate_quiz(jsonb) FROM PUBLIC;
--> statement-breakpoint
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_section_copy_quiz(jsonb) FROM PUBLIC;
--> statement-breakpoint
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_update_quiz(jsonb) FROM PUBLIC;
