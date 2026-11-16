-- Live definition of sol_get_course_lms_nav() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_get_course_lms_nav(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_nav jsonb;
  v_syllabus text;
BEGIN
  SELECT tenant_id, lms_navigation, syllabus_markdown
  INTO v_tenant, v_nav, v_syllabus
  FROM courses WHERE id = p_course_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  RETURN jsonb_build_object(
    'navigation', v_nav,
    'syllabusMarkdown', v_syllabus,
    'tenantId', v_tenant
  );
END;
$$;
