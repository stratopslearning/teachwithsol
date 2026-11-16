-- Live definition of sol_chatbot_session_by_id() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_chatbot_session_by_id(
  p_session_id uuid,
  p_student_id uuid,
  p_chatbot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_row chatbot_sessions%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_student_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_row
  FROM chatbot_sessions
  WHERE id = p_session_id
    AND student_id = p_student_id
    AND (p_chatbot_id IS NULL OR chatbot_id = p_chatbot_id);
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
