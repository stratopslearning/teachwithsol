-- Live definition of sol_set_course_activity_active() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_set_course_activity_active(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz uuid := NULLIF(p_payload->>'quizId', '')::uuid;
  v_lesson uuid := NULLIF(p_payload->>'lessonId', '')::uuid;
  v_chatbot uuid := NULLIF(p_payload->>'chatbotId', '')::uuid;
  v_interactive uuid := NULLIF(p_payload->>'interactiveId', '')::uuid;
  v_active boolean := COALESCE((p_payload->>'isActive')::boolean, true);
  v_id uuid;
  v_tenant uuid;
BEGIN
  IF v_quiz IS NOT NULL THEN
    SELECT id, tenant_id INTO v_id, v_tenant FROM course_activities WHERE quiz_id = v_quiz LIMIT 1;
  ELSIF v_lesson IS NOT NULL THEN
    SELECT id, tenant_id INTO v_id, v_tenant FROM course_activities WHERE lesson_id = v_lesson LIMIT 1;
  ELSIF v_chatbot IS NOT NULL THEN
    SELECT id, tenant_id INTO v_id, v_tenant FROM course_activities WHERE chatbot_id = v_chatbot LIMIT 1;
  ELSIF v_interactive IS NOT NULL THEN
    SELECT id, tenant_id INTO v_id, v_tenant FROM course_activities WHERE interactive_id = v_interactive LIMIT 1;
  END IF;
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;
  UPDATE course_activities
  SET is_active = v_active, updated_at = now()
  WHERE id = v_id;
END;
$$;
REVOKE ALL ON FUNCTION sol_set_course_activity_active(jsonb) FROM PUBLIC;
