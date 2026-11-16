-- Live definition of sol_courses_for_tenants() (last changed in drizzle/0051_workspace_courses_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_courses_for_tenants(p_tenant_ids uuid[])
RETURNS TABLE (
  id uuid,
  workspace_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.id, c.workspace_id
  FROM courses c
  WHERE c.deleted_at IS NULL
    AND c.workspace_id = ANY (p_tenant_ids);
$$;
REVOKE ALL ON FUNCTION sol_courses_for_tenants(uuid[]) FROM PUBLIC;
