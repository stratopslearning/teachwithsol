-- Live definition of sol_student_enrolled_in_quiz() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_student_enrolled_in_quiz(
  p_student_id uuid,
  p_quiz_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM quiz_sections qs
    JOIN student_sections ss ON ss.section_id = qs.section_id
    WHERE qs.quiz_id = p_quiz_id
      AND ss.student_id = p_student_id
      AND ss.status = 'ACTIVE'
  );
END;
$$;
