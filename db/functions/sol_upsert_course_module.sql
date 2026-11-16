-- Live definition of sol_upsert_course_module() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_course_module(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id', '')::uuid;
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid;
  v_row course_modules%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM courses WHERE id = v_course AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  IF v_id IS NULL THEN
    INSERT INTO course_modules (
      course_id, tenant_id, title, position, published, unlock_at, prerequisite_module_ids
    ) VALUES (
      v_course,
      v_tenant,
      coalesce(p_payload->>'title', 'Module'),
      coalesce((p_payload->>'position')::int, 0),
      coalesce((p_payload->>'published')::boolean, false),
      NULLIF(p_payload->>'unlockAt', '')::timestamptz,
      coalesce(p_payload->'prerequisiteModuleIds', '[]'::jsonb)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE course_modules SET
      title = coalesce(p_payload->>'title', title),
      position = coalesce((p_payload->>'position')::int, position),
      published = coalesce((p_payload->>'published')::boolean, published),
      unlock_at = CASE WHEN p_payload ? 'unlockAt'
        THEN NULLIF(p_payload->>'unlockAt', '')::timestamptz ELSE unlock_at END,
      prerequisite_module_ids = coalesce(p_payload->'prerequisiteModuleIds', prerequisite_module_ids),
      updated_at = now()
    WHERE id = v_id AND course_id = v_course AND deleted_at IS NULL
    RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
