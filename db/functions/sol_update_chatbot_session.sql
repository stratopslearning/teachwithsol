-- Live definition of sol_update_chatbot_session() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_chatbot_session(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := (p_payload->>'sessionId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_tenant uuid;
  v_row chatbot_sessions%ROWTYPE;
BEGIN
  IF v_session_id IS NULL OR v_student IS NULL THEN
    RAISE EXCEPTION 'sessionId and studentId required';
  END IF;

  SELECT COALESCE(cs.tenant_id, c.tenant_id) INTO v_tenant
  FROM chatbot_sessions cs
  JOIN chatbots c ON c.id = cs.chatbot_id
  WHERE cs.id = v_session_id AND cs.student_id = v_student;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE chatbot_sessions SET
    messages = COALESCE(p_payload->'messages', messages),
    session_metadata = COALESCE(p_payload->'sessionMetadata', session_metadata),
    struggle_topics = COALESCE(
      CASE
        WHEN p_payload ? 'struggleTopics' THEN p_payload->'struggleTopics'
        ELSE NULL
      END,
      struggle_topics
    ),
    status = COALESCE(NULLIF(p_payload->>'status', ''), status),
    completed_at = CASE
      WHEN NULLIF(p_payload->>'status', '') = 'completed'
        THEN COALESCE(completed_at, now())
      ELSE completed_at
    END,
    tenant_id = COALESCE(tenant_id, v_tenant)
  WHERE id = v_session_id AND student_id = v_student
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
