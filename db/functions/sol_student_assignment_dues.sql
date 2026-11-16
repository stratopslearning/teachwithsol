-- Live definition of sol_student_assignment_dues() (last changed in drizzle/0097_force_rls_remaining_pack.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_student_assignment_dues(
  p_student_id uuid,
  p_quiz_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_student_id IS NULL OR p_quiz_ids IS NULL OR cardinality(p_quiz_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'quizId', a.quiz_id,
        'dueDate', a.due_date
      ))
      FROM assignments a
      WHERE a.student_id = p_student_id
        AND a.quiz_id = ANY(p_quiz_ids)
    ),
    '[]'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION sol_student_assignment_dues(uuid, uuid[]) FROM PUBLIC;
