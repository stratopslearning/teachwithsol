-- Live definition of sol_ensure_workspace_membership() (last changed in drizzle/0083_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_ensure_workspace_membership(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_user uuid := (p_payload->>'userId')::uuid;
  v_status text := COALESCE(NULLIF(trim(p_payload->>'status'), ''), 'active');
  v_existing workspace_memberships%ROWTYPE;
  v_next_status text;
BEGIN
  IF v_workspace IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'workspaceId and userId required';
  END IF;
  IF v_status NOT IN ('active', 'invited', 'removed') THEN
    RAISE EXCEPTION 'invalid membership status: %', v_status;
  END IF;

  PERFORM set_config('app.tenant_id', v_workspace::text, true);

  SELECT * INTO v_existing
  FROM workspace_memberships
  WHERE workspace_id = v_workspace AND user_id = v_user
  LIMIT 1;

  IF FOUND THEN
    v_next_status := CASE
      WHEN v_status = 'active' THEN 'active'
      WHEN v_existing.status = 'active' THEN 'active'
      ELSE v_status
    END;
    UPDATE workspace_memberships
    SET
      status = v_next_status,
      role = 'member',
      updated_at = now()
    WHERE id = v_existing.id;
    RETURN;
  END IF;

  INSERT INTO workspace_memberships (
    workspace_id, user_id, role, status
  ) VALUES (
    v_workspace, v_user, 'member', v_status
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_ensure_workspace_membership(jsonb) FROM PUBLIC;
