-- Staff claim path needs these DEFINER helpers (originally in 0076).
-- Production was missing them while create-invite existed, so claim links 500'd.

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
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_find_staff_invite_by_token(text) FROM PUBLIC;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION sol_claim_staff_invite(
  p_token_hash text,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  section_id uuid,
  email text,
  role text,
  granted_by uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE section_staff_invites i
  SET
    claimed_at = now(),
    claimed_by_user_id = p_user_id
  WHERE i.token_hash = p_token_hash
    AND i.claimed_at IS NULL
    AND i.expires_at > now()
  RETURNING
    i.id, i.tenant_id, i.section_id, i.email, i.role, i.granted_by, i.expires_at;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sol_claim_staff_invite(text, uuid) FROM PUBLIC;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sol_app') THEN
    GRANT EXECUTE ON FUNCTION sol_find_staff_invite_by_token(text) TO sol_app;
    GRANT EXECUTE ON FUNCTION sol_claim_staff_invite(text, uuid) TO sol_app;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner')
     AND pg_has_role(current_user, 'neondb_owner', 'member') THEN
    ALTER FUNCTION sol_find_staff_invite_by_token(text) OWNER TO neondb_owner;
    ALTER FUNCTION sol_claim_staff_invite(text, uuid) OWNER TO neondb_owner;
  END IF;
END $$;
