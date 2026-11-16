-- Live definition of sol_list_peer_discussions() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_peer_discussions(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_rows jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant FROM courses WHERE id = p_course_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::jsonb)
  INTO v_rows FROM peer_discussions d WHERE d.course_id = p_course_id AND d.deleted_at IS NULL;
  RETURN v_rows;
END;
$$;
