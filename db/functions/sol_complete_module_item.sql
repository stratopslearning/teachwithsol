-- Live definition of sol_complete_module_item() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_complete_module_item(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item uuid := (p_payload->>'moduleItemId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_tenant uuid;
  v_row module_item_progress%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM module_items WHERE id = v_item AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  INSERT INTO module_item_progress (module_item_id, student_id, tenant_id, status, completed_at)
  VALUES (v_item, v_student, v_tenant, 'COMPLETED', now())
  ON CONFLICT (module_item_id, student_id) DO UPDATE SET
    status = 'COMPLETED',
    completed_at = coalesce(module_item_progress.completed_at, now()),
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;
