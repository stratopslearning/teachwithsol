-- Live definition of sol_attempt_score_rows_for_sections() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_attempt_score_rows_for_sections(p_section_ids uuid[])
RETURNS TABLE (
  student_id uuid,
  quiz_id uuid,
  percentage integer,
  score integer,
  max_score integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT a.student_id, a.quiz_id, a.percentage, a.score, a.max_score
  FROM attempts a
  WHERE a.section_id = ANY (p_section_ids)
    AND a.submitted_at IS NOT NULL;
$$;
