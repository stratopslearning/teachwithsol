-- Live definition of sol_user_enrolled_in_section() (last changed in drizzle/0049_user_bindings_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_user_enrolled_in_section(
  p_user_id uuid,
  p_section_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM student_sections ss
    WHERE ss.student_id = p_user_id
      AND ss.section_id = p_section_id
      AND ss.status = 'ACTIVE'
  );
$$;
REVOKE ALL ON FUNCTION sol_user_enrolled_in_section(uuid, uuid) FROM PUBLIC;
