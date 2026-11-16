-- Live definition of sol_complete_chatbot_session() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_complete_chatbot_session(
  p_session_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session chatbot_sessions%ROWTYPE;
  v_tenant uuid;
BEGIN
  IF p_session_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'sessionId and studentId required';
  END IF;

  SELECT * INTO v_session
  FROM chatbot_sessions
  WHERE id = p_session_id AND student_id = p_student_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_tenant := v_session.tenant_id;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM chatbots WHERE id = v_session.chatbot_id;
  END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  UPDATE chatbot_sessions
  SET status = 'completed', completed_at = COALESCE(completed_at, now())
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  UPDATE chatbot_assignments
  SET is_completed = true, completed_at = COALESCE(completed_at, now())
  WHERE id = v_session.assignment_id;

  RETURN to_jsonb(v_session);
END;
$$;
