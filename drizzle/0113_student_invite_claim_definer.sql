-- Student claim path needs sol_claim_student_invite (originally in 0076).
-- Production had find-by-token but not claim, so learner invite links 500'd.

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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_claim_student_invite(text, uuid) FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_claim_student_invite(text, uuid) TO sol_app;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_claim_student_invite(text, uuid) OWNER TO neondb_owner;
  END IF;
END $$;
