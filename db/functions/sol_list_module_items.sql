-- Live definition of sol_list_module_items() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_module_items(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_rows jsonb;
BEGIN
  IF p_module_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT tenant_id INTO v_tenant FROM course_modules WHERE id = p_module_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.position, i.created_at), '[]'::jsonb)
  INTO v_rows
  FROM module_items i
  WHERE i.module_id = p_module_id AND i.deleted_at IS NULL;
  RETURN v_rows;
END;
$$;
