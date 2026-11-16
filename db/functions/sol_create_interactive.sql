-- Live definition of sol_create_interactive() (last changed in drizzle/0105_publish_lesson_interactive_rls.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_interactive(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course uuid := (p_payload->>'courseId')::uuid;
  v_professor uuid := (p_payload->>'professorId')::uuid;
  v_hint uuid := NULLIF(p_payload->>'tenantId', '')::uuid;
  v_tenant uuid;
  v_offering uuid;
  v_row interactives%ROWTYPE;
BEGIN
  IF v_course IS NULL OR v_professor IS NULL THEN
    RAISE EXCEPTION 'courseId and professorId required';
  END IF;

  IF v_hint IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', v_hint::text, true);
  ELSE
    PERFORM set_config('app.tenant_id', '', true);
  END IF;

  SELECT COALESCE(c.tenant_id, c.workspace_id),
         sol_default_offering_for_course(c.id)
  INTO v_tenant, v_offering
  FROM courses c WHERE c.id = v_course AND c.deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Course not found'; END IF;
  v_tenant := COALESCE(v_hint, v_tenant);
  PERFORM set_config('app.tenant_id', v_tenant::text, true);

  INSERT INTO interactives (
    professor_id, course_id, tenant_id, offering_id, title, description,
    kind, body, package_storage_key, is_active, source_outline_item_id
  ) VALUES (
    v_professor, v_course, v_tenant, v_offering,
    COALESCE(NULLIF(trim(p_payload->>'title'), ''), 'Untitled interactive'),
    NULLIF(p_payload->>'description', ''),
    COALESCE(p_payload->>'kind', 'SCORM'),
    COALESCE(p_payload->'body', '{}'::jsonb),
    NULL,
    COALESCE((p_payload->>'isActive')::boolean, false),
    NULLIF(p_payload->>'sourceOutlineItemId', '')::uuid
  )
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION sol_create_interactive(jsonb) FROM PUBLIC;
