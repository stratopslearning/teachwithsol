-- Live definition of sol_create_workspace_invite() (last changed in drizzle/0084_more_rls_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_create_workspace_invite(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid := (p_payload->>'workspaceId')::uuid;
  v_email text := lower(trim(COALESCE(p_payload->>'email', '')));
  v_role text := COALESCE(NULLIF(trim(p_payload->>'role'), ''), 'owner');
  v_token_hash text := p_payload->>'tokenHash';
  v_expires timestamptz := (p_payload->>'expiresAt')::timestamptz;
  v_id uuid;
BEGIN
  IF v_workspace IS NULL OR v_email = '' OR v_token_hash IS NULL OR v_expires IS NULL THEN
    RAISE EXCEPTION 'workspaceId, email, tokenHash, expiresAt required';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'instructor') THEN
    RAISE EXCEPTION 'invalid invite role';
  END IF;

  PERFORM set_config('app.tenant_id', v_workspace::text, true);

  UPDATE workspace_invites
  SET expires_at = now()
  WHERE workspace_id = v_workspace
    AND lower(email) = v_email
    AND claimed_at IS NULL;

  INSERT INTO workspace_invites (workspace_id, email, role, token_hash, expires_at)
  VALUES (v_workspace, v_email, v_role, v_token_hash, v_expires)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'expiresAt', v_expires);
END;
$$;
REVOKE ALL ON FUNCTION sol_create_workspace_invite(jsonb) FROM PUBLIC;
