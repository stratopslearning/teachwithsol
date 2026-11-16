-- Live definition of sol_user_has_active_enrollment() (last changed in drizzle/0049_user_bindings_read.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_user_has_active_enrollment(p_user_id uuid)
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
      AND ss.status = 'ACTIVE'
  );
$$;
REVOKE ALL ON FUNCTION sol_user_has_active_enrollment(uuid) FROM PUBLIC;
