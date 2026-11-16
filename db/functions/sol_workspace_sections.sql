-- Live definition of sol_workspace_sections() (last changed in drizzle/0051_workspace_courses_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_workspace_sections(p_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  course_id uuid,
  name text,
  professor_enrollment_code text,
  student_enrollment_code text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id,
    s.course_id,
    s.name,
    s.professor_enrollment_code,
    s.student_enrollment_code,
    s.is_active,
    s.created_at
  FROM sections s
  JOIN courses c ON c.id = s.course_id
  WHERE c.workspace_id = p_workspace_id
    AND c.deleted_at IS NULL
    AND s.deleted_at IS NULL
  ORDER BY s.created_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_workspace_sections(uuid) FROM PUBLIC;
