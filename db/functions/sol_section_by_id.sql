-- Live definition of sol_section_by_id() (last changed in drizzle/0052_entity_resolve_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_section_by_id(p_section_id uuid)
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
  deleted_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    s.id, s.course_id, s.offering_id, s.workspace_id, s.tenant_id,
    s.name, s.professor_enrollment_code, s.student_enrollment_code,
    s.is_active, s.ends_at, s.deleted_at
  FROM sections s
  WHERE s.id = p_section_id;
$$;
REVOKE ALL ON FUNCTION sol_section_by_id(uuid) FROM PUBLIC;
