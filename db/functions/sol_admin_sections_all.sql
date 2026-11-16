-- Live definition of sol_admin_sections_all() (last changed in drizzle/0054_admin_platform_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_admin_sections_all()
RETURNS TABLE (
  id uuid,
  course_id uuid,
  offering_id uuid,
  workspace_id uuid,
  tenant_id uuid,
  name text,
  professor_enrollment_code text,
  student_enrollment_code text,
  is_active boolean,
  ends_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz,
  course_title text,
  workspace_name text,
  learner_count integer,
  faculty_count integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    s.id,
    s.course_id,
    s.offering_id,
    s.workspace_id,
    s.tenant_id,
    s.name,
    s.professor_enrollment_code,
    s.student_enrollment_code,
    s.is_active,
    s.ends_at,
    s.deleted_at,
    s.created_at,
    c.title AS course_title,
    w.name AS workspace_name,
    (
      SELECT count(*)::int FROM student_sections ss
      WHERE ss.section_id = s.id AND ss.status = 'ACTIVE'
    ) AS learner_count,
    (
      SELECT count(*)::int FROM professor_sections ps
      WHERE ps.section_id = s.id AND ps.status = 'ACTIVE'
    ) AS faculty_count
  FROM sections s
  JOIN courses c ON c.id = s.course_id
  LEFT JOIN workspaces w ON w.id = COALESCE(s.workspace_id, c.workspace_id)
  WHERE s.deleted_at IS NULL
  ORDER BY s.created_at DESC;
$$;
REVOKE ALL ON FUNCTION sol_admin_sections_all() FROM PUBLIC;
