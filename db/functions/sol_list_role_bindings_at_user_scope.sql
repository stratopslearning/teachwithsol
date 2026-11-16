-- Live definition of sol_list_role_bindings_at_user_scope() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_list_role_bindings_at_user_scope(
  p_user_id uuid,
  p_scope_type text,
  p_scope_id uuid
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
  WHERE b.user_id = p_user_id
    AND b.scope_type = p_scope_type
    AND b.scope_id = p_scope_id
    AND b.revoked_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_list_role_bindings_at_user_scope(uuid, text, uuid) FROM PUBLIC;
