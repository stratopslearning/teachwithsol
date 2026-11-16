-- Live definition of resolve_lti_platform() (last changed in drizzle/0042_tenantize_remaining.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION resolve_lti_platform(p_issuer text, p_client_id text)
RETURNS TABLE (
  platform_id uuid,
  workspace_id uuid,
  tenant_id uuid,
  issuer text,
  client_id text,
  auth_login_url text,
  auth_token_url text,
  key_set_url text,
  label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.workspace_id,
    COALESCE(p.tenant_id, tenant_root(p.workspace_id)),
    p.issuer,
    p.client_id,
    p.auth_login_url,
    p.auth_token_url,
    p.key_set_url,
    p.label
  FROM lti_platforms p
  WHERE p.issuer = p_issuer AND p.client_id = p_client_id
  LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION resolve_lti_platform(text, text) TO sol_app;
