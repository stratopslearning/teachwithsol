-- Live definition of sol_claim_student_invite() (last changed in drizzle/0113_student_invite_claim_definer.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_claim_student_invite(
  p_token_hash text,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  section_id uuid,
  email text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE section_student_invites i
  SET
    claimed_at = now(),
    claimed_by_user_id = p_user_id
  WHERE i.token_hash = p_token_hash
    AND i.claimed_at IS NULL
    AND i.expires_at > now()
  RETURNING
    i.id, i.tenant_id, i.section_id, i.email, i.expires_at;
END;
$$;
REVOKE ALL ON FUNCTION sol_claim_student_invite(text, uuid) FROM PUBLIC;
