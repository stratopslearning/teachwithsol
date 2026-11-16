-- Live definition of sol_student_gradebook_attempts() (last changed in drizzle/0109_student_force_rls_crud.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_student_gradebook_attempts(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_student_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x."submittedAt" DESC NULLS LAST)
      FROM (
        SELECT
          a.id,
          a.quiz_id AS "quizId",
          a.section_id AS "sectionId",
          s.name AS "sectionName",
          q.title AS "quizTitle",
          c.title AS "courseTitle",
          a.submitted_at AS "submittedAt",
          a.score,
          a.max_score AS "maxScore",
          a.percentage,
          a.passed,
          s.ends_at AS "sectionEndsAt"
        FROM attempts a
        JOIN quizzes q ON q.id = a.quiz_id
        JOIN sections s ON s.id = a.section_id
        LEFT JOIN courses c ON c.id = s.course_id
        WHERE a.student_id = p_student_id
          AND a.submitted_at IS NOT NULL
        ORDER BY a.submitted_at DESC
      ) x
    ),
    '[]'::jsonb
  );
END;
$$;
