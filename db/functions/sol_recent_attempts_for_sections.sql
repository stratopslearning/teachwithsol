-- Live definition of sol_recent_attempts_for_sections() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_recent_attempts_for_sections(
  p_section_ids uuid[],
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  quiz_id uuid,
  section_id uuid,
  submitted_at timestamptz,
  percentage integer,
  score integer,
  max_score integer,
  student_name text,
  student_email text,
  quiz_title text,
  section_name text,
  course_title text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    a.id, a.student_id, a.quiz_id, a.section_id, a.submitted_at,
    a.percentage, a.score, a.max_score,
    nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
    u.email, q.title, s.name, c.title
  FROM attempts a
  JOIN users u ON u.id = a.student_id
  JOIN quizzes q ON q.id = a.quiz_id
  JOIN sections s ON s.id = a.section_id
  JOIN courses c ON c.id = s.course_id
  WHERE a.section_id = ANY (p_section_ids)
    AND a.submitted_at IS NOT NULL
  ORDER BY a.submitted_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;
