-- Live definition of sol_find_workspace_id_by_slug() (last changed in drizzle/0086_admin_purge_access_entitlement.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_find_workspace_id_by_slug(p_slug text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT id FROM workspaces
  WHERE lower(slug) = lower(trim(p_slug))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION sol_find_workspace_id_by_slug(text) FROM PUBLIC;
