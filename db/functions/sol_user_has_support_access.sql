-- Live definition of sol_user_has_support_access() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_user_has_support_access(
  p_user_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM support_access_grants g
    WHERE g.user_id = p_user_id
      AND g.tenant_id = p_tenant_id
      AND g.expires_at > now()
  );
$$;
REVOKE ALL ON FUNCTION sol_user_has_support_access(uuid, uuid) FROM PUBLIC;
