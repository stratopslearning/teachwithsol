-- Live definition of sol_user_role_bindings() (last changed in drizzle/0049_user_bindings_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_user_role_bindings(
  p_user_id uuid,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid,
  role text,
  scope_type text,
  scope_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT b.tenant_id, b.role::text, b.scope_type::text, b.scope_id
  FROM role_bindings b
  WHERE b.user_id = p_user_id
    AND b.revoked_at IS NULL
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id);
$$;
REVOKE ALL ON FUNCTION sol_user_role_bindings(uuid, uuid) FROM PUBLIC;
