-- Live definition of sol_update_course_lms_settings() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_update_course_lms_settings(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid;
  v_nav jsonb;
  v_syllabus text;
BEGIN
  SELECT tenant_id INTO v_tenant FROM courses WHERE id = v_course AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  UPDATE courses SET
    lms_navigation = CASE WHEN p_payload ? 'navigation'
      THEN p_payload->'navigation' ELSE lms_navigation END,
    syllabus_markdown = CASE WHEN p_payload ? 'syllabusMarkdown'
      THEN p_payload->>'syllabusMarkdown' ELSE syllabus_markdown END,
    updated_at = now()
  WHERE id = v_course
  RETURNING lms_navigation, syllabus_markdown INTO v_nav, v_syllabus;

  RETURN jsonb_build_object('navigation', v_nav, 'syllabusMarkdown', v_syllabus);
END;
$$;
