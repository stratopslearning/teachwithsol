-- Live definition of sol_sync_course_activity() (last changed in drizzle/0106_publish_activity_chatbot_rls.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_sync_course_activity(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := p_payload->>'type';
  v_quiz uuid := NULLIF(p_payload->>'quizId', '')::uuid;
  v_lesson uuid := NULLIF(p_payload->>'lessonId', '')::uuid;
  v_chatbot uuid := NULLIF(p_payload->>'chatbotId', '')::uuid;
  v_interactive uuid := NULLIF(p_payload->>'interactiveId', '')::uuid;
  v_course uuid := NULLIF(p_payload->>'courseId', '')::uuid;
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_hint uuid := NULLIF(p_payload->>'tenantId', '')::uuid;
  v_tenant uuid;
  v_id uuid;
  v_row course_activities%ROWTYPE;
BEGIN
  IF v_professor IS NULL OR v_type IS NULL THEN
    RAISE EXCEPTION 'professorId and type required';
  END IF;

  -- Establish tenant before FORCE RLS reads of courses / activities / lessons.
  IF v_hint IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_hint::text, true);
    v_tenant := v_hint;
  ELSE
    PERFORM set_config('app.tenant_id', '', true);
  END IF;

  IF v_tenant IS NULL AND v_course IS NOT NULL THEN
    SELECT COALESCE(c.tenant_id, c.workspace_id) INTO v_tenant
    FROM courses c WHERE c.id = v_course;
  END IF;
  IF v_tenant IS NULL AND v_quiz IS NOT NULL THEN
    SELECT q.tenant_id INTO v_tenant FROM quizzes q WHERE q.id = v_quiz;
  END IF;
  IF v_tenant IS NULL AND v_lesson IS NOT NULL THEN
    SELECT l.tenant_id INTO v_tenant FROM lessons l WHERE l.id = v_lesson;
  END IF;
  IF v_tenant IS NULL AND v_chatbot IS NOT NULL THEN
    SELECT cb.tenant_id INTO v_tenant FROM chatbots cb WHERE cb.id = v_chatbot;
  END IF;
  IF v_tenant IS NULL AND v_interactive IS NOT NULL THEN
    SELECT i.tenant_id INTO v_tenant FROM interactives i WHERE i.id = v_interactive;
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  IF v_quiz IS NOT NULL THEN
    SELECT id INTO v_id FROM course_activities WHERE quiz_id = v_quiz LIMIT 1;
  ELSIF v_lesson IS NOT NULL THEN
    SELECT id INTO v_id FROM course_activities WHERE lesson_id = v_lesson LIMIT 1;
  ELSIF v_chatbot IS NOT NULL THEN
    SELECT id INTO v_id FROM course_activities WHERE chatbot_id = v_chatbot LIMIT 1;
  ELSIF v_interactive IS NOT NULL THEN
    SELECT id INTO v_id FROM course_activities WHERE interactive_id = v_interactive LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE course_activities SET
      course_id = COALESCE(v_course, course_id),
      tenant_id = COALESCE(v_tenant, tenant_id),
      professor_id = v_professor,
      type = v_type,
      title = COALESCE(NULLIF(trim(p_payload->>'title'), ''), title),
      description = CASE
        WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description', '')
        ELSE description
      END,
      start_date = CASE
        WHEN p_payload ? 'startDate' THEN NULLIF(p_payload->>'startDate', '')::timestamptz
        ELSE start_date
      END,
      end_date = CASE
        WHEN p_payload ? 'endDate' THEN NULLIF(p_payload->>'endDate', '')::timestamptz
        ELSE end_date
      END,
      is_active = COALESCE((p_payload->>'isActive')::boolean, is_active),
      source_outline_item_id = CASE
        WHEN p_payload ? 'sourceOutlineItemId'
          THEN NULLIF(p_payload->>'sourceOutlineItemId', '')::uuid
        ELSE source_outline_item_id
      END,
      position = COALESCE((p_payload->>'position')::int, position),
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO course_activities (
      course_id, tenant_id, professor_id, type, title, description,
      quiz_id, lesson_id, chatbot_id, interactive_id,
      start_date, end_date, is_active, source_outline_item_id, position
    ) VALUES (
      v_course,
      v_tenant,
      v_professor,
      v_type,
      COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled'),
      NULLIF(p_payload->>'description', ''),
      v_quiz, v_lesson, v_chatbot, v_interactive,
      NULLIF(p_payload->>'startDate', '')::timestamptz,
      NULLIF(p_payload->>'endDate', '')::timestamptz,
      COALESCE((p_payload->>'isActive')::boolean, true),
      NULLIF(p_payload->>'sourceOutlineItemId', '')::uuid,
      COALESCE((p_payload->>'position')::int, 0)
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'courseId', v_row.course_id,
    'type', v_row.type,
    'title', v_row.title,
    'isActive', v_row.is_active
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_sync_course_activity(jsonb) FROM PUBLIC;
