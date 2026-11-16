-- Live definition of sol_course_by_id() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_course_by_id(p_course_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  workspace_id uuid,
  tenant_id uuid,
  status text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT c.id, c.title, c.description, c.workspace_id, c.tenant_id, c.status::text
  FROM courses c
  WHERE c.id = p_course_id AND c.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_course_by_id(uuid) FROM PUBLIC;
