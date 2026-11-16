-- Live definition of sol_sections_by_ids() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_sections_by_ids(p_ids uuid[])
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
  course_title text,
  course_workspace_id uuid
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    s.id, s.course_id, s.offering_id, s.workspace_id, s.tenant_id,
    s.name, s.professor_enrollment_code, s.student_enrollment_code,
    s.is_active, s.ends_at,
    c.title AS course_title,
    c.workspace_id AS course_workspace_id
  FROM sections s
  JOIN courses c ON c.id = s.course_id
  WHERE s.id = ANY (p_ids)
    AND s.deleted_at IS NULL
    AND c.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION sol_sections_by_ids(uuid[]) FROM PUBLIC;
