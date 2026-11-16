-- Live definition of sol_professor_section_enrollment() (last changed in drizzle/0071_faculty_write_definers.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_professor_section_enrollment(
  p_professor_id uuid,
  p_section_id uuid
)
RETURNS TABLE (id uuid, status text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT ps.id, ps.status::text
  FROM professor_sections ps
  WHERE ps.professor_id = p_professor_id AND ps.section_id = p_section_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION sol_professor_section_enrollment(uuid, uuid) FROM PUBLIC;
