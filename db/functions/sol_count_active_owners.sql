-- Live definition of sol_count_active_owners() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_count_active_owners(p_tenant_id uuid)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT count(*)::int
  FROM role_bindings b
  WHERE b.tenant_id = p_tenant_id
    AND b.scope_type = 'organization'
    AND b.scope_id = p_tenant_id
    AND b.role = 'owner'
    AND b.revoked_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_count_active_owners(uuid) FROM PUBLIC;
