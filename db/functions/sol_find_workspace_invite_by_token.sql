-- Live definition of sol_find_workspace_invite_by_token() (last changed in drizzle/0076_invite_claim_definer_hardening.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_find_workspace_invite_by_token(p_token_hash text)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  email text,
  role text,
  token_hash text,
  expires_at timestamptz,
  claimed_at timestamptz,
  claimed_by_user_id uuid,
  created_at timestamptz,
  workspace_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.workspace_id, i.email, i.role, i.token_hash,
    i.expires_at, i.claimed_at, i.claimed_by_user_id, i.created_at,
    w.name AS workspace_name
  FROM workspace_invites i
  LEFT JOIN workspaces w ON w.id = i.workspace_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION sol_find_workspace_invite_by_token(text) FROM PUBLIC;
