-- Live definition of sol_upsert_interactive_progress() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_upsert_interactive_progress(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interactive uuid := (p_payload->>'interactiveId')::uuid;
  v_student uuid := (p_payload->>'studentId')::uuid;
  v_status text := p_payload->>'status';
  v_xapi jsonb := p_payload->'xapiSummary';
  v_tenant uuid;
  v_existing interactive_progress%ROWTYPE;
  v_row interactive_progress%ROWTYPE;
BEGIN
  IF v_interactive IS NULL OR v_student IS NULL OR v_status IS NULL THEN
    RAISE EXCEPTION 'interactiveId, studentId, status required';
  END IF;
  IF v_status NOT IN ('STARTED', 'COMPLETED') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT COALESCE(i.tenant_id, c.tenant_id, c.workspace_id)
  INTO v_tenant
  FROM interactives i
  LEFT JOIN courses c ON c.id = i.course_id
  WHERE i.id = v_interactive;
  IF v_tenant IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
  END IF;

  SELECT * INTO v_existing
  FROM interactive_progress
  WHERE interactive_id = v_interactive AND student_id = v_student;

  IF FOUND THEN
    IF v_existing.status = 'COMPLETED' AND v_status = 'STARTED' THEN
      RETURN to_jsonb(v_existing);
    END IF;
    UPDATE interactive_progress SET
      status = v_status,
      completed_at = CASE
        WHEN v_status = 'COMPLETED' THEN COALESCE(completed_at, now())
        ELSE completed_at
      END,
      xapi_summary = COALESCE(v_xapi, xapi_summary),
      tenant_id = COALESCE(tenant_id, v_tenant),
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
    RETURN to_jsonb(v_row);
  END IF;

  INSERT INTO interactive_progress (
    interactive_id, student_id, tenant_id, status, completed_at, xapi_summary
  ) VALUES (
    v_interactive,
    v_student,
    v_tenant,
    v_status,
    CASE WHEN v_status = 'COMPLETED' THEN now() ELSE NULL END,
    v_xapi
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
