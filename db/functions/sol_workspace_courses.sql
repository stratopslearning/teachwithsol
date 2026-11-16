-- Live definition of sol_workspace_courses() (last changed in drizzle/0051_workspace_courses_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_workspace_courses(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  tenant_id uuid,
  title text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id,
    c.workspace_id,
    c.tenant_id,
    c.title,
    c.description,
    c.status::text,
    c.created_at,
    c.updated_at
  FROM courses c
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
  ORDER BY c.created_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_workspace_courses(uuid) FROM PUBLIC;
