-- Live definition of sol_admin_courses_all() (last changed in drizzle/0054_admin_platform_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_courses_all()
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  tenant_id uuid,
  title text,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  section_count integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    c.id,
    c.workspace_id,
    c.tenant_id,
    c.title,
    c.description,
    c.status::text,
    c.created_at,
    c.updated_at,
    (
      SELECT count(*)::int
      FROM sections s
      WHERE s.course_id = c.id AND s.deleted_at IS NULL
    ) AS section_count
  FROM courses c
  WHERE c.deleted_at IS NULL
  ORDER BY c.created_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_admin_courses_all() FROM PUBLIC;
