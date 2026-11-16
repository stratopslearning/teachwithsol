-- Live definition of sol_offering_course_id() (last changed in drizzle/0051_workspace_courses_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_offering_course_id(p_offering_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT o.course_id FROM course_offerings o WHERE o.id = p_offering_id;
$$;
REVOKE ALL ON FUNCTION sol_offering_course_id(uuid) FROM PUBLIC;
