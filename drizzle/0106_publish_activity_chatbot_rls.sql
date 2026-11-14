-- Publish still failed after lesson create: sol_sync_course_activity and
-- sol_create_chatbot are owned by sol_migrator (no BYPASSRLS) and SELECT
-- courses/sections before app.tenant_id is set. Prefer payload tenantId,
-- then re-own to neondb_owner (same pattern as 0105).

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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION sol_create_chatbot(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_section_ids uuid[] := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'sectionIds', '[]'::jsonb))::uuid),
    ARRAY[]::uuid[]
  );
  v_hint uuid := NULLIF(p_payload->>'tenantId', '')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_id uuid;
  v_title text;
BEGIN
  IF v_hint IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_hint::text, true);
    v_tenant := v_hint;
  ELSE
    PERFORM set_config('app.tenant_id', '', true);
  END IF;

  IF array_length(v_section_ids, 1) IS NOT NULL THEN
    SELECT COALESCE(s.tenant_id, s.workspace_id), s.offering_id
    INTO v_tenant, v_offering
    FROM sections s WHERE s.id = v_section_ids[1] AND s.deleted_at IS NULL;
  END IF;
  v_tenant := COALESCE(v_hint, v_tenant);
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  INSERT INTO chatbots (
    professor_id, tenant_id, offering_id, title, description, persona_name,
    instructions, system_prompt, related_quiz_id, is_template, model, is_active
  ) VALUES (
    v_professor,
    v_tenant,
    v_offering,
    COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled discussion'),
    NULLIF(p_payload->>'description', ''),
    COALESCE(NULLIF(trim(p_payload->>'personaName'), ''), 'Professor Emma'),
    COALESCE(p_payload->>'instructions', ''),
    COALESCE(p_payload->>'systemPrompt', ''),
    NULLIF(p_payload->>'relatedQuizId', '')::uuid,
    false,
    COALESCE(NULLIF(p_payload->>'model', ''), 'gpt-4.1-mini'),
    COALESCE((p_payload->>'isActive')::boolean, true)
  )
  RETURNING id, title INTO v_id, v_title;

  IF array_length(v_section_ids, 1) IS NOT NULL THEN
    INSERT INTO chatbot_sections (chatbot_id, section_id, assigned_by, tenant_id)
    SELECT v_id, sid, v_professor, v_tenant
    FROM unnest(v_section_ids) AS sid;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'title', v_title);
END;
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_sync_course_activity(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION sol_create_chatbot(jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_sync_course_activity(jsonb) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_create_chatbot(jsonb) TO sol_app;
  END IF;
END
$$;

--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_sync_course_activity(jsonb) OWNER TO neondb_owner;
    ALTER FUNCTION sol_create_chatbot(jsonb) OWNER TO neondb_owner;
  END IF;
END
$$;
