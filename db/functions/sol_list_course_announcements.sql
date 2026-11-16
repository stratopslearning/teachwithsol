-- Live definition of sol_list_course_announcements() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_course_announcements(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_rows jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant FROM courses WHERE id = p_course_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC), '[]'::jsonb)
  INTO v_rows FROM course_announcements a WHERE a.course_id = p_course_id AND a.deleted_at IS NULL;
  RETURN v_rows;
END;
$$;
