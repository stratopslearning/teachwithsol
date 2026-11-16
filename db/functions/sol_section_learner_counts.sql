-- Live definition of sol_section_learner_counts() (last changed in drizzle/0053_faculty_student_reads.sql).
-- Edit here, then run `npm run db:functions:migrate` to write the migration.

CREATE OR REPLACE FUNCTION sol_section_learner_counts(p_section_ids uuid[])
RETURNS TABLE (section_id uuid, learner_count integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.id, COALESCE(COUNT(ss.id) FILTER (WHERE ss.status = 'ACTIVE'), 0)::int
  FROM unnest(p_section_ids) AS s(id)
  LEFT JOIN student_sections ss ON ss.section_id = s.id
  GROUP BY s.id;
$$;
