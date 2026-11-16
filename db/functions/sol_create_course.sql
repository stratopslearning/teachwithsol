-- Live definition of sol_create_course() (last changed in drizzle/0082_create_course_definer.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_course(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_title text := NULLIF(trim(p_payload->>'title'), '');
  v_description text := NULLIF(trim(p_payload->>'description'), '');
  v_user uuid := NULLIF(p_payload->>'createdByUserId', '')::uuid;
  v_bind boolean := COALESCE((p_payload->>'bindCreator')::boolean, true);
  v_course uuid;
  v_offering uuid;
  v_row courses%ROWTYPE;
BEGIN
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'workspaceId required';
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'title required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = v_workspace) THEN
    RAISE EXCEPTION 'Workspace not found: %', v_workspace;
  END IF;

  PERFORM set_config('app.tenant_id', v_workspace::text, true);

  INSERT INTO courses (
    workspace_id,
    tenant_id,
    title,
    description,
    status,
    is_active
  ) VALUES (
    v_workspace,
    v_workspace,
    left(v_title, 100),
    v_description,
    'ACTIVE',
    true
  )
  RETURNING * INTO v_row;

  v_course := v_row.id;

  INSERT INTO course_offerings (course_id, tenant_id, term_label, status)
  VALUES (v_course, v_workspace, 'default', 'active')
  ON CONFLICT (course_id, term_label) DO NOTHING
  RETURNING id INTO v_offering;

  IF v_offering IS NULL THEN
    SELECT o.id INTO v_offering
    FROM course_offerings o
    WHERE o.course_id = v_course AND o.term_label = 'default'
    LIMIT 1;
  END IF;

  IF v_bind AND v_user IS NOT NULL AND v_offering IS NOT NULL THEN
    INSERT INTO role_bindings (
      tenant_id, user_id, scope_type, scope_id, role, granted_by
    ) VALUES (
      v_workspace, v_user, 'offering', v_offering, 'lead_instructor', v_user
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'workspaceId', v_row.workspace_id,
    'tenantId', v_row.tenant_id,
    'title', v_row.title,
    'description', v_row.description,
    'status', v_row.status,
    'isActive', v_row.is_active,
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at,
    'offeringId', v_offering
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_create_course(jsonb) FROM PUBLIC;
