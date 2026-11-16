-- Live definition of sol_lti_platforms_for_workspace() (last changed in drizzle/0077_workspace_read_columns.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE FUNCTION sol_lti_platforms_for_workspace(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  issuer text,
  client_id text,
  auth_login_url text,
  auth_token_url text,
  key_set_url text,
  label text,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    p.id,
    p.issuer,
    p.client_id,
    p.auth_login_url,
    p.auth_token_url,
    p.key_set_url,
    p.label,
    p.created_at
  FROM lti_platforms p
  WHERE p.tenant_id = p_workspace_id
  ORDER BY p.created_at DESC;
$$;
