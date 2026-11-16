-- Live definition of sol_create_access_request() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_access_request(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_email text := lower(trim(COALESCE(p_payload->>'email', '')));
  v_name text := NULLIF(trim(COALESCE(p_payload->>'name', '')), '');
  v_role text := COALESCE(NULLIF(p_payload->>'claimedRole', ''), 'instructor');
  v_user uuid := NULLIF(p_payload->>'userId', '')::uuid;
  v_existing uuid;
  v_id uuid;
BEGIN
  IF v_workspace IS NULL OR v_email = '' OR NOT (v_email LIKE '%@%') THEN
    RAISE EXCEPTION 'workspaceId and valid email required';
  END IF;
  IF v_role NOT IN ('instructor', 'admin') THEN
    RAISE EXCEPTION 'invalid claimedRole';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = v_workspace) THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  PERFORM set_config('app.tenant_id', v_workspace::text, true);

  SELECT id INTO v_existing
  FROM workspace_access_requests
  WHERE workspace_id = v_workspace
    AND lower(email) = v_email
    AND status = 'pending'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing);
  END IF;

  INSERT INTO workspace_access_requests (
    workspace_id, email, name, claimed_role, user_id, status
  ) VALUES (
    v_workspace, v_email, v_name, v_role, v_user, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION sol_create_access_request(jsonb) FROM PUBLIC;
