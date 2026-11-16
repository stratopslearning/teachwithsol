-- Live definition of sol_role_binding_by_id() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_role_binding_by_id(p_binding_id uuid)
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
  WHERE b.id = p_binding_id;
$$;
REVOKE ALL ON FUNCTION sol_role_binding_by_id(uuid) FROM PUBLIC;
