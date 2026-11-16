-- Live definition of sol_quiz_ids_for_sections() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_quiz_ids_for_sections(p_section_ids uuid[])
RETURNS TABLE (quiz_id uuid, section_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT qs.quiz_id, qs.section_id
  FROM quiz_sections qs
  WHERE qs.section_id = ANY (p_section_ids);
$$;
