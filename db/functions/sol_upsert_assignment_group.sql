-- Live definition of sol_upsert_assignment_group() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_assignment_group(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id', '')::uuid;
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid;
  v_row assignment_groups%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM courses WHERE id = v_course AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  IF v_id IS NULL THEN
    INSERT INTO assignment_groups (course_id, tenant_id, name, weight, drop_lowest, position)
    VALUES (
      v_course, v_tenant,
      coalesce(p_payload->>'name', 'Assignments'),
      coalesce((p_payload->>'weight')::int, 0),
      coalesce((p_payload->>'dropLowest')::int, 0),
      coalesce((p_payload->>'position')::int, 0)
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE assignment_groups SET
      name = coalesce(p_payload->>'name', name),
      weight = coalesce((p_payload->>'weight')::int, weight),
      drop_lowest = coalesce((p_payload->>'dropLowest')::int, drop_lowest),
      position = coalesce((p_payload->>'position')::int, position),
      updated_at = now()
    WHERE id = v_id AND course_id = v_course AND deleted_at IS NULL
    RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
