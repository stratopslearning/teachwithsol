-- Live definition of sol_list_module_item_progress() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_module_item_progress(p_student_id uuid, p_module_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_rows jsonb;
BEGIN
  IF p_module_ids IS NULL OR array_length(p_module_ids, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT tenant_id INTO v_tenant FROM course_modules WHERE id = p_module_ids[1] AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO v_rows
  FROM module_item_progress p
  JOIN module_items i ON i.id = p.module_item_id
  WHERE p.student_id = p_student_id
    AND i.module_id = ANY(p_module_ids)
    AND i.deleted_at IS NULL;
  RETURN v_rows;
END;
$$;
