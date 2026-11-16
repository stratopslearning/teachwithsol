-- Live definition of sol_claim_workspace_invite() (last changed in drizzle/0076_invite_claim_definer_hardening.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_claim_workspace_invite(
  p_token_hash text,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  email text,
  role text,
  expires_at timestamptz,
  workspace_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE workspace_invites i
  SET
    claimed_at = now(),
    claimed_by_user_id = p_user_id
  FROM workspaces w
  WHERE i.token_hash = p_token_hash
    AND i.claimed_at IS NULL
    AND i.expires_at > now()
    AND w.id = i.workspace_id
  RETURNING
    i.id, i.workspace_id, i.email, i.role, i.expires_at, w.name;
END;
$$;
REVOKE ALL ON FUNCTION sol_claim_workspace_invite(text, uuid) FROM PUBLIC;
