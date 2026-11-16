-- Live definition of sol_find_staff_invite_by_token() (last changed in drizzle/0112_staff_invite_claim_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_find_staff_invite_by_token(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  section_id uuid,
  email text,
  role text,
  token_hash text,
  granted_by uuid,
  expires_at timestamptz,
  claimed_at timestamptz,
  claimed_by_user_id uuid,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.tenant_id, i.section_id, i.email, i.role, i.token_hash,
    i.granted_by, i.expires_at, i.claimed_at, i.claimed_by_user_id, i.created_at
  FROM section_staff_invites i
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION sol_find_staff_invite_by_token(text) FROM PUBLIC;
