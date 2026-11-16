-- Live definition of sol_workspace_type() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_workspace_type(p_workspace_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT w.type::text FROM workspaces w WHERE w.id = p_workspace_id;
$$;
REVOKE ALL ON FUNCTION sol_workspace_type(uuid) FROM PUBLIC;
