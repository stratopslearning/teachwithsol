-- Live definition of sol_resolve_section_by_enrollment_code() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_resolve_section_by_enrollment_code(p_code text)
RETURNS TABLE (
  section_id uuid,
  course_id uuid,
  workspace_id uuid,
  tenant_id uuid,
  name text,
  code_kind text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.id, s.course_id,
         COALESCE(s.workspace_id, c.workspace_id),
         COALESCE(s.tenant_id, c.tenant_id, c.workspace_id),
         s.name,
         CASE
           WHEN upper(s.student_enrollment_code) = upper(p_code) THEN 'student'
           WHEN upper(s.professor_enrollment_code) = upper(p_code) THEN 'professor'
           ELSE NULL
         END
  FROM sections s
  JOIN courses c ON c.id = s.course_id
  WHERE s.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND (
      upper(s.student_enrollment_code) = upper(p_code)
      OR upper(s.professor_enrollment_code) = upper(p_code)
    )
  LIMIT 1;
$$;
