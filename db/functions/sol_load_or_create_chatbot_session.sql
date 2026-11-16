-- Live definition of sol_load_or_create_chatbot_session() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_load_or_create_chatbot_session(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chatbot uuid := (p_payload->>'chatbotId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_session_id uuid := NULLIF(p_payload->>'sessionId', '')::uuid;
  v_section_id uuid := NULLIF(p_payload->>'sectionId', '')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_assignment chatbot_assignments%ROWTYPE;
  v_session chatbot_sessions%ROWTYPE;
BEGIN
  IF v_chatbot IS NULL OR v_student IS NULL THEN
    RAISE EXCEPTION 'chatbotId and studentId required';
  END IF;

  SELECT tenant_id, offering_id INTO v_tenant, v_offering
  FROM chatbots WHERE id = v_chatbot;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_assignment
  FROM chatbot_assignments
  WHERE chatbot_id = v_chatbot AND student_id = v_student;

  IF NOT FOUND THEN
    INSERT INTO chatbot_assignments (
      chatbot_id, student_id, tenant_id, offering_id
    ) VALUES (
      v_chatbot, v_student, v_tenant, v_offering
    )
    ON CONFLICT (chatbot_id, student_id) DO NOTHING;

    SELECT * INTO v_assignment
    FROM chatbot_assignments
    WHERE chatbot_id = v_chatbot AND student_id = v_student;
  END IF;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Failed to ensure chatbot assignment';
  END IF;

  IF v_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM chatbot_sessions
    WHERE id = v_session_id
      AND chatbot_id = v_chatbot
      AND student_id = v_student;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
  ELSE
    SELECT * INTO v_session
    FROM chatbot_sessions
    WHERE assignment_id = v_assignment.id
      AND status = 'in_progress'
    LIMIT 1;

    IF NOT FOUND AND v_assignment.is_completed THEN
      SELECT * INTO v_session
      FROM chatbot_sessions
      WHERE assignment_id = v_assignment.id
        AND status = 'completed'
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF v_session.id IS NULL THEN
      IF v_section_id IS NULL THEN
        RETURN jsonb_build_object(
          'assignment', to_jsonb(v_assignment),
          'session', NULL,
          'needsSection', true
        );
      END IF;

      IF v_tenant IS NULL THEN
        SELECT COALESCE(s.tenant_id, s.workspace_id), s.offering_id
        INTO v_tenant, v_offering
        FROM sections s WHERE s.id = v_section_id;
        IF v_tenant IS NOT NULL THEN
          PERFORM set_config('app.tenant_id', v_tenant::text, true);
        END IF;
      END IF;

      INSERT INTO chatbot_sessions (
        assignment_id, student_id, chatbot_id, section_id,
        tenant_id, offering_id, messages, status
      ) VALUES (
        v_assignment.id, v_student, v_chatbot, v_section_id,
        v_tenant, v_offering, '[]'::jsonb, 'in_progress'
      )
      RETURNING * INTO v_session;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'assignment', to_jsonb(v_assignment),
    'session', to_jsonb(v_session),
    'needsSection', false
  );
END;
$$;
