-- Live definition of sol_find_role_binding() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_find_role_binding(
  p_tenant_id uuid,
  p_user_id uuid,
  p_scope_type text,
  p_scope_id uuid,
  p_role text
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  scope_type text,
  scope_id uuid,
  role text,
  granted_by uuid,
  created_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT b.id, b.tenant_id, b.user_id, b.scope_type::text, b.scope_id,
         b.role::text, b.granted_by, b.created_at, b.revoked_at
  FROM role_bindings b
  WHERE b.tenant_id = p_tenant_id
    AND b.user_id = p_user_id
    AND b.scope_type = p_scope_type
    AND b.scope_id = p_scope_id
    AND b.role = p_role
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION sol_find_role_binding(uuid, uuid, text, uuid, text) FROM PUBLIC;
