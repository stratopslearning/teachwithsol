-- Live definition of resolve_api_token() (last changed in drizzle/0042_tenantize_remaining.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION resolve_api_token(p_token_hash text)
RETURNS TABLE (
  token_id uuid,
  user_id uuid,
  tenant_id uuid,
  scopes jsonb,
  revoked_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    t.tenant_id,
    t.scopes,
    t.revoked_at,
    t.expires_at
  FROM professor_api_tokens t
  WHERE t.token_hash = p_token_hash
  LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION resolve_api_token(text) TO sol_app;
