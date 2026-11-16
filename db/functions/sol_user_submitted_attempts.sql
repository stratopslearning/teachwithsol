-- Live definition of sol_user_submitted_attempts() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_user_submitted_attempts(
  p_user_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  quiz_id uuid,
  section_id uuid,
  submitted_at timestamptz,
  percentage integer,
  score integer,
  max_score integer,
  quiz_title text,
  section_name text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    a.id, a.quiz_id, a.section_id, a.submitted_at,
    a.percentage, a.score, a.max_score,
    q.title, s.name
  FROM attempts a
  JOIN quizzes q ON q.id = a.quiz_id
  JOIN sections s ON s.id = a.section_id
  WHERE a.student_id = p_user_id
    AND a.submitted_at IS NOT NULL
  ORDER BY a.submitted_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;
