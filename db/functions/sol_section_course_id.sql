-- Live definition of sol_section_course_id() (last changed in drizzle/0051_workspace_courses_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_section_course_id(p_section_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT s.course_id FROM sections s WHERE s.id = p_section_id;
$$;
REVOKE ALL ON FUNCTION sol_section_course_id(uuid) FROM PUBLIC;
