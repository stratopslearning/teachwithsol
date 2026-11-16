-- Live definition of sol_user_enrollments_detail() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_user_enrollments_detail(p_user_id uuid)
RETURNS TABLE (
  enrollment_id uuid,
  section_id uuid,
  status text,
  enrolled_at timestamptz,
  section_name text,
  section_ends_at timestamptz,
  course_id uuid,
  course_title text,
  workspace_id uuid,
  workspace_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    ss.id, ss.section_id, ss.status::text, ss.enrolled_at,
    s.name, s.ends_at,
    c.id, c.title,
    c.workspace_id, w.name
  FROM student_sections ss
  JOIN sections s ON s.id = ss.section_id
  JOIN courses c ON c.id = s.course_id
  LEFT JOIN workspaces w ON w.id = c.workspace_id
  WHERE ss.student_id = p_user_id
    AND ss.status = 'ACTIVE'
    AND s.deleted_at IS NULL
    AND c.deleted_at IS NULL
  ORDER BY ss.enrolled_at DESC;
$$;
