-- Live definition of sol_courses_by_ids() (last changed in drizzle/0051_workspace_courses_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_courses_by_ids(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  title text,
  section_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id,
    c.title,
    (
      SELECT count(*)::int
      FROM sections s
      WHERE s.course_id = c.id
        AND s.deleted_at IS NULL
    ) AS section_count
  FROM courses c
  WHERE c.id = ANY (p_ids)
    AND c.deleted_at IS NULL
  ORDER BY c.title;
$$;
REVOKE ALL ON FUNCTION sol_courses_by_ids(uuid[]) FROM PUBLIC;
