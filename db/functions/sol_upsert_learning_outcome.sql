-- Live definition of sol_upsert_learning_outcome() (last changed in drizzle/0100_canvas_lms_course_ia.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_learning_outcome(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id', '')::uuid;
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_tenant uuid;
  v_row learning_outcomes%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM courses WHERE id = v_course AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'course_not_found'; END IF;
  PERFORM set_config('app.tenant_id', v_tenant::text, true);
  IF v_id IS NULL THEN
    INSERT INTO learning_outcomes (course_id, tenant_id, title, description, mastery_percent, position)
    VALUES (
      v_course, v_tenant,
      coalesce(p_payload->>'title', 'Outcome'),
      p_payload->>'description',
      coalesce((p_payload->>'masteryPercent')::int, 70),
      coalesce((p_payload->>'position')::int, 0)
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE learning_outcomes SET
      title = coalesce(p_payload->>'title', title),
      description = coalesce(p_payload->>'description', description),
      mastery_percent = coalesce((p_payload->>'masteryPercent')::int, mastery_percent),
      position = coalesce((p_payload->>'position')::int, position),
      updated_at = now()
    WHERE id = v_id AND course_id = v_course AND deleted_at IS NULL
    RETURNING * INTO v_row;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
